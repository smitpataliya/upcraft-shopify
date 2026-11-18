// Reconciliation Engine for UNKNOWN State Outcomes
// Protects merchants against duplicate order generation when network timeouts occur.
// Safely queries Shopify DraftOrder GID to inspect whether the mutation took effect.

import { getDb, logAudit } from './db.js';
import { shopifyClient } from './shopify.js';

export async function reconcileJobItem(itemId, actor = 'system', ipAddress = null) {
  const db = getDb();
  const item = db.prepare('SELECT * FROM bulk_job_items WHERE id = ?').get(itemId);

  if (!item) {
    throw new Error(`Job item ${itemId} not found`);
  }

  if (item.status !== 'UNKNOWN') {
    throw new Error(`Item ${item.draft_order_name} is in status ${item.status}, not UNKNOWN.`);
  }

  try {
    const draftNode = await shopifyClient.reconcileDraftOrder(item.draft_order_id);

    if (!draftNode) {
      db.prepare(`
        UPDATE bulk_job_items 
        SET error_message = 'Reconciliation query returned null. Draft may not exist in Shopify.' 
        WHERE id = ?
      `).run(itemId);
      return { success: false, status: 'UNKNOWN', message: 'Draft not found in Shopify' };
    }

    if (draftNode.status === 'COMPLETED' && draftNode.order) {
      // The order was actually completed successfully before the timeout occurred!
      const gatewayNames = Array.isArray(draftNode.order.paymentGatewayNames)
        ? draftNode.order.paymentGatewayNames.join(', ')
        : 'COD';

      db.prepare(`
        UPDATE bulk_job_items 
        SET status = 'SUCCEEDED',
            shopify_order_id = ?,
            shopify_order_name = ?,
            payment_gateway_names = ?,
            display_financial_status = ?,
            reconciled_at = CURRENT_TIMESTAMP,
            error_message = 'Recovered via reconciliation: order was created before timeout'
        WHERE id = ?
      `).run(
        draftNode.order.id,
        draftNode.order.name,
        gatewayNames,
        draftNode.order.displayFinancialStatus || 'PENDING',
        itemId
      );

      // Adjust job counters: decrement unknown_count, increment success_count
      db.prepare(`
        UPDATE bulk_jobs 
        SET unknown_count = MAX(0, unknown_count - 1), 
            success_count = success_count + 1 
        WHERE id = ?
      `).run(item.job_id);

      logAudit({
        actor,
        action: 'JOB_ITEM_RECONCILED_SUCCESS',
        targetType: 'BULK_JOB_ITEM',
        targetId: itemId,
        metadata: {
          jobId: item.job_id,
          draftOrderId: item.draft_order_id,
          recoveredOrderId: draftNode.order.id,
          recoveredOrderName: draftNode.order.name
        },
        ipAddress
      });

      return {
        success: true,
        status: 'SUCCEEDED',
        recovered: true,
        order: draftNode.order,
        message: `Order ${draftNode.order.name} successfully recovered.`
      };
    } else if (draftNode.status === 'OPEN') {
      // Mutation never executed on Shopify side. Safe for controlled retry.
      db.prepare(`
        UPDATE bulk_job_items 
        SET status = 'PENDING',
            reconciled_at = CURRENT_TIMESTAMP,
            error_message = 'Reconciled: Draft remains OPEN on Shopify. Reset to PENDING for retry.'
        WHERE id = ?
      `).run(itemId);

      // Adjust job counters
      db.prepare(`
        UPDATE bulk_jobs 
        SET unknown_count = MAX(0, unknown_count - 1) 
        WHERE id = ?
      `).run(item.job_id);

      logAudit({
        actor,
        action: 'JOB_ITEM_RECONCILED_RESET',
        targetType: 'BULK_JOB_ITEM',
        targetId: itemId,
        metadata: { jobId: item.job_id, draftOrderId: item.draft_order_id },
        ipAddress
      });

      return {
        success: true,
        status: 'PENDING',
        recovered: false,
        message: 'Draft order verified as still OPEN. Reset to PENDING.'
      };
    } else {
      // Draft has other unexpected status
      return {
        success: false,
        status: 'UNKNOWN',
        message: `Draft order has unexpected status: ${draftNode.status}`
      };
    }
  } catch (err) {
    return {
      success: false,
      status: 'UNKNOWN',
      error: err.message,
      message: `Failed to reconcile item: ${err.message}`
    };
  }
}

