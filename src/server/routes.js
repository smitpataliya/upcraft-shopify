// REST API Endpoints for Upcraft Shopify Dashboard
// Implements exact route contracts from Section 9 of the implementation guide.

import { express } from './deps.js';
import { shopifyClient } from './shopify.js';
import { jobQueue } from './queue.js';
import { reconcileJobItem } from './reconciliation.js';
import { authenticate, requireRole, loginUser, revokeSession } from './auth.js';
import { getConfig, updateConfig, getAuditLogs, logAudit } from './db.js';

export const router = express.Router();

// -------------------------------------------------------------
// 1. Health & Status
// -------------------------------------------------------------
router.get('/health', (req, res) => {
  const config = getConfig();
  res.json({
    status: 'UP',
    name: 'upcraft-shopify',
    version: '1.0.0',
    mockMode: config.mock_mode,
    storeDomain: config.store_domain,
    apiVersion: config.api_version,
    timestamp: new Date().toISOString()
  });
});

// -------------------------------------------------------------
// 2. Authentication
// -------------------------------------------------------------
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  const result = loginUser(username, password);
  if (!result.success) {
    logAudit({
      actor: username,
      action: 'LOGIN_FAILED',
      targetType: 'STAFF_USER',
      ipAddress: req.ip
    });
    return res.status(401).json(result);
  }

  logAudit({
    actor: result.user.username,
    action: 'LOGIN_SUCCESS',
    targetType: 'STAFF_USER',
    targetId: result.user.userId,
    ipAddress: req.ip
  });

  res.json(result);
});

router.get('/auth/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

router.post('/auth/logout', authenticate, (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    revokeSession(authHeader.slice(7));
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// -------------------------------------------------------------
// 3. Draft Orders Retrieval & Single Test
// -------------------------------------------------------------
// Helper function to thoroughly validate and analyze draft order fields
export function analyzeDraftOrder(draft, codMarkerValue = 'COD') {
  const tags = Array.isArray(draft.tags) ? draft.tags : [];
  const hasCodTag = tags.some(t => t.toUpperCase() === (codMarkerValue || 'COD').toUpperCase());

  const rawPhone = draft.phone || draft.customer?.phone || draft.shippingAddress?.phone;
  const hasPhone = Boolean(rawPhone && String(rawPhone).replace(/\D/g, '').length >= 7);

  const address1 = draft.shippingAddress?.address1;
  const hasAddress1 = Boolean(address1 && String(address1).trim().length > 0);

  const city = draft.shippingAddress?.city;
  const hasCity = Boolean(city && String(city).trim().length > 0);

  const state = draft.shippingAddress?.province || draft.shippingAddress?.provinceCode;
  const hasState = Boolean(state && String(state).trim().length > 0);

  const zip = draft.shippingAddress?.zip;
  const hasZip = Boolean(zip && String(zip).trim().length >= 3);

  const totalAmount = parseFloat(draft.totalPriceSet?.shopMoney?.amount || 0);

  const missingFields = [];
  if (!hasPhone) missingFields.push('Phone Number');
  if (!hasAddress1) missingFields.push('Address Line 1');
  if (!hasCity) missingFields.push('City');
  if (!hasState) missingFields.push('State');
  if (!hasZip) missingFields.push('Pincode');
  if (!hasCodTag) missingFields.push('COD Tag');

  const isAddressComplete = hasPhone && hasAddress1 && hasCity && hasState && hasZip;
  const isCodEligible = isAddressComplete && hasCodTag && draft.status === 'OPEN';

  const flags = [];
  if (!hasCodTag) flags.push('NON_COD_MARKER');
  if (!hasPhone) flags.push('MISSING_PHONE');
  if (!hasCity) flags.push('MISSING_CITY');
  if (!hasState) flags.push('MISSING_STATE');
  if (!hasZip) flags.push('MISSING_PINCODE');
  if (!hasAddress1) flags.push('MISSING_ADDRESS');
  if (totalAmount > 15000) flags.push('HIGH_VALUE');
  if (totalAmount <= 0) flags.push('ZERO_AMOUNT');

  return {
    ...draft,
    isCodEligible,
    isAddressComplete,
    missingFields,
    flags
  };
}

router.get('/draft-orders', authenticate, async (req, res) => {
  try {
    const first = parseInt(req.query.first || '50', 10);
    const after = req.query.after || null;
    const query = req.query.query || 'status:OPEN';

    const result = await shopifyClient.getDraftOrders({ first, after, query });
    const config = getConfig();

    const enrichedNodes = (result.nodes || []).map(draft =>
      analyzeDraftOrder(draft, config.cod_marker_value)
    );

    res.json({
      success: true,
      data: {
        nodes: enrichedNodes,
        pageInfo: result.pageInfo
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/draft-orders/verify', authenticate, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Array of draft order IDs is required' });
    }

    const verified = await shopifyClient.verifyDrafts(ids);
    const config = getConfig();

    const analysis = verified.map(v => {
      const analyzed = analyzeDraftOrder(v, config.cod_marker_value);
      const isOpen = analyzed.status === 'OPEN';
      let rejectionReason = null;
      if (!isOpen) {
        rejectionReason = `Draft is ${analyzed.status}`;
      } else if (!analyzed.isAddressComplete) {
        rejectionReason = `Missing required details: ${analyzed.missingFields.filter(f => f !== 'COD Tag').join(', ')}`;
      } else if (!analyzed.isCodEligible) {
        rejectionReason = 'Missing COD tag';
      }

      return {
        ...analyzed,
        isEligible: analyzed.isCodEligible,
        rejectionReason
      };
    });

    res.json({ success: true, data: analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const handleUpdateDraft = async (req, res) => {
  try {
    const rawId = req.params.id || req.body?.id;
    if (!rawId) {
      return res.status(400).json({ success: false, message: 'Draft order ID is required' });
    }
    const numericId = String(rawId).replace(/\D/g, '');
    const draftId = `gid://shopify/DraftOrder/${numericId}`;
    const { shippingAddress, tags, email, phone, note, addCodTag } = req.body || {};
    const config = getConfig();

    const input = {};
    if (email !== undefined) input.email = email;
    if (phone !== undefined) input.phone = phone;
    if (note !== undefined) input.note = note;

    if (shippingAddress) {
      input.shippingAddress = {
        firstName: shippingAddress.firstName || undefined,
        lastName: shippingAddress.lastName || undefined,
        address1: shippingAddress.address1 || undefined,
        address2: shippingAddress.address2 || undefined,
        city: shippingAddress.city || undefined,
        province: shippingAddress.province || undefined,
        zip: shippingAddress.zip || undefined,
        country: shippingAddress.country || 'India',
        phone: shippingAddress.phone || phone || undefined
      };
    }

    let finalTags = tags;
    if (addCodTag) {
      const currentTags = Array.isArray(tags) ? [...tags] : [];
      if (!currentTags.some(t => t.toUpperCase() === config.cod_marker_value.toUpperCase())) {
        currentTags.push(config.cod_marker_value);
      }
      finalTags = currentTags;
    }
    if (finalTags !== undefined) input.tags = finalTags;

    const result = await shopifyClient.updateDraftOrder(draftId, input);

    if (result.userErrors && result.userErrors.length > 0) {
      return res.status(422).json({
        success: false,
        userErrors: result.userErrors,
        message: result.userErrors.map(e => e.message).join(' | ')
      });
    }

    logAudit({
      actor: req.user.username,
      action: 'DRAFT_ORDER_UPDATED',
      targetType: 'DRAFT_ORDER',
      targetId: draftId,
      metadata: { input },
      ipAddress: req.ip
    });

    const analyzed = analyzeDraftOrder(result.draftOrder, config.cod_marker_value);

    res.json({
      success: true,
      message: `Draft order ${result.draftOrder.name} updated successfully!`,
      data: analyzed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

router.put('/draft-orders/:id', authenticate, handleUpdateDraft);
router.put('/draft-orders', authenticate, handleUpdateDraft);

router.post('/draft-orders/test-single', authenticate, async (req, res) => {
  try {
    const { id, paymentGatewayId } = req.body || {};
    if (!id) {
      return res.status(400).json({ success: false, message: 'Draft order ID is required' });
    }

    // Safety validation before single test conversion
    const verified = await shopifyClient.verifyDrafts([id]);
    const config = getConfig();
    if (verified.length > 0) {
      const analyzed = analyzeDraftOrder(verified[0], config.cod_marker_value);
      if (!analyzed.isAddressComplete) {
        return res.status(422).json({
          success: false,
          message: `Cannot convert draft order ${analyzed.name}: missing required details (${analyzed.missingFields.filter(f => f !== 'COD Tag').join(', ')}). Please edit and complete address first.`
        });
      }
    }

    const result = await shopifyClient.completeDraftOrder(id, paymentGatewayId);

    logAudit({
      actor: req.user.username,
      action: 'SINGLE_DRAFT_TEST_EXECUTED',
      targetType: 'DRAFT_ORDER',
      targetId: id,
      metadata: { result },
      ipAddress: req.ip
    });

    if (result.userErrors && result.userErrors.length > 0) {
      return res.status(422).json({
        success: false,
        userErrors: result.userErrors,
        message: result.userErrors.map(e => e.message).join(' | ')
      });
    }

    res.json({
      success: true,
      data: result.draftOrder,
      message: `Single draft test successful! Created Order ${result.draftOrder.order.name}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 4. Bulk Jobs Engine
// -------------------------------------------------------------
router.post('/bulk-jobs', authenticate, (req, res) => {
  try {
    const { drafts } = req.body || {};
    const config = getConfig();

    const job = jobQueue.createBulkJob({
      createdBy: req.user.username,
      drafts,
      storeDomain: config.store_domain,
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, data: job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/bulk-jobs', authenticate, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const jobs = jobQueue.getRecentJobs(limit);
    res.json({ success: true, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/bulk-jobs/:jobId', authenticate, (req, res) => {
  try {
    const job = jobQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/bulk-jobs/:jobId/start', authenticate, async (req, res) => {
  try {
    const job = await jobQueue.startJob(req.params.jobId, req.user.username, req.ip);
    res.json({ success: true, data: job, message: 'Bulk job started' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/bulk-jobs/:jobId/cancel', authenticate, (req, res) => {
  try {
    const job = jobQueue.cancelJob(req.params.jobId, req.user.username, req.ip);
    res.json({ success: true, data: job, message: 'Job cancellation requested' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/bulk-jobs/:jobId/items/:itemId/reconcile', authenticate, async (req, res) => {
  try {
    const result = await reconcileJobItem(req.params.itemId, req.user.username, req.ip);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/bulk-jobs/:jobId/export', authenticate, (req, res) => {
  try {
    const job = jobQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).send('Job not found');
    }

    const headers = [
      'Item ID',
      'Draft Order ID',
      'Draft Order Name',
      'Customer Name',
      'Customer Phone',
      'Total Amount',
      'Currency',
      'Status',
      'Shopify Order ID',
      'Shopify Order Name',
      'Payment Gateway',
      'Financial Status',
      'Error Code',
      'Error Message',
      'Attempts',
      'Last Attempt At',
      'Reconciled At'
    ];

    const escapeCsv = val => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = (job.items || []).map(item => [
      item.id,
      item.draft_order_id,
      item.draft_order_name,
      item.customer_name,
      item.customer_phone,
      item.total_amount,
      item.currency,
      item.status,
      item.shopify_order_id,
      item.shopify_order_name,
      item.payment_gateway_names,
      item.display_financial_status,
      item.error_code,
      item.error_message,
      item.attempts,
      item.last_attempt_at,
      item.reconciled_at
    ].map(escapeCsv).join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bulk-job-${job.id.slice(0, 8)}-report.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send(`Export failed: ${err.message}`);
  }
});

// -------------------------------------------------------------
// 5. Store Settings & Config
// -------------------------------------------------------------
router.get('/config', authenticate, (req, res) => {
  const config = getConfig();
  res.json({ success: true, data: config });
});

router.put('/config', authenticate, requireRole(['ADMIN']), (req, res) => {
  try {
    const updated = updateConfig(req.body);
    logAudit({
      actor: req.user.username,
      action: 'STORE_CONFIG_UPDATED',
      targetType: 'STORE_CONFIG',
      metadata: {
        storeDomain: updated.store_domain,
        apiVersion: updated.api_version,
        codMarkerValue: updated.cod_marker_value,
        mockMode: updated.mock_mode
      },
      ipAddress: req.ip
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/config/test-connection', authenticate, async (req, res) => {
  try {
    const result = await shopifyClient.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 5b. Shopify OAuth App Installation & Callback
// -------------------------------------------------------------
router.get('/shopify/install', (req, res) => {
  const currentConfig = getConfig();
  let shop = req.query.shop || currentConfig.store_domain;
  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }
  shop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  const clientId = currentConfig.client_id || process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) {
    return res.status(400).send('Client ID is not configured in Upcraft settings.');
  }

  const redirectUri = `http://localhost:4000/api/shopify/callback`;
  const scopes = 'read_draft_orders,write_draft_orders,read_orders,read_customers';
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  res.redirect(installUrl);
});

router.get('/shopify/callback', async (req, res) => {
  const { shop, code } = req.query;
  if (!shop || !code) {
    return res.status(400).send('Missing shop or authorization code');
  }

  const currentConfig = getConfig();
  const clientId = currentConfig.client_id || process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = currentConfig.client_secret || process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(400).send('Client ID or Client Secret not configured.');
  }

  const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');

  try {
    const tokenRes = await fetch(`https://${cleanShop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange authorization code for token');
    }

    updateConfig({
      store_domain: cleanShop,
      access_token: tokenData.access_token,
      mock_mode: 0
    });

    logAudit({
      actor: 'shopify_oauth',
      action: 'OAUTH_TOKEN_ACQUIRED',
      targetType: 'STORE_CONFIG',
      metadata: { storeDomain: cleanShop, scopes: tokenData.scope }
    });

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Shopify Connected</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="text-align: center; background: #1e293b; padding: 48px; border-radius: 16px; border: 1px solid #334155; max-width: 480px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
            <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
            <h1 style="color: #10b981; margin: 0 0 12px 0; font-size: 24px;">Connected to Shopify!</h1>
            <p style="color: #94a3b8; font-size: 15px; margin: 0 0 28px 0; line-height: 1.5;">
              Store <strong style="color: #f1f5f9;">${cleanShop}</strong> successfully linked. Token saved to Upcraft.
            </p>
            <a href="/" style="background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Open Upcraft Dashboard
            </a>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`OAuth Exchange Error: ${err.message}`);
  }
});

// -------------------------------------------------------------
// 6. Audit Trail
// -------------------------------------------------------------
router.get('/audit-logs', authenticate, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const logs = getAuditLogs(limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
