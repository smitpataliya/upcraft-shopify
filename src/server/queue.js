// Bulk Confirmation Job Runner & Throttled Queue
// Enforces sequential processing, rate-limiting delays, and atomic status transitions.
// Manages UNKNOWN timeout states and job cancellations safely.

import crypto from 'node:crypto';
import { getDb, logAudit, getConfig } from './db.js';
import { shopifyClient } from './shopify.js';

class JobQueue {
  constructor() {
    this.activeWorkers = new Map(); // jobId -> boolean
    this.recoverStuckJobs();
  }

  recoverStuckJobs() {
    try {
      const db = getDb();
      db.prepare("UPDATE bulk_job_items SET status = 'PENDING' WHERE status = 'PROCESSING'").run();
      const runningJobs = db.prepare("SELECT id FROM bulk_jobs WHERE status = 'RUNNING'").all();
      for (const j of runningJobs) {
        this.processJobLoop(j.id, 'recovery').catch(err => console.error('[Recovery Error]', err));
      }
    } catch (e) {
      console.error('[Recovery Init Error]', e);
    }
  }

  createBulkJob({ createdBy, drafts, storeDomain, ipAddress }) {
    const db = getDb();
    const config = getConfig();

    if (!drafts || drafts.length === 0) {
      throw new Error('Selection cannot be empty. Select at least 1 draft order.');
    }
    if (drafts.length > config.max_batch_size) {
      throw new Error(`Selection of ${drafts.length} exceeds maximum batch limit of ${config.max_batch_size}.`);
    }

    // Safety guard: reject drafts with incomplete delivery details
    const incompleteDrafts = drafts.filter(d => d.isAddressComplete === false);
    if (incompleteDrafts.length > 0) {
      const names = incompleteDrafts.map(d => d.name || d.id).join(', ');
      throw new Error(`Cannot create bulk confirmation job: Draft(s) ${names} have incomplete delivery details (missing city, state, pincode, or phone).`);
    }

    const jobId = crypto.randomUUID();
    const requestedCount = drafts.length;

    const totalAmount = drafts.reduce((sum, d) => {
      const amt = parseFloat(d.totalPriceSet?.shopMoney?.amount || d.total_amount || 0);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    const currency = drafts[0]?.totalPriceSet?.shopMoney?.currencyCode || drafts[0]?.currency || 'INR';

    db.prepare(`
      INSERT INTO bulk_jobs (
        id, store_domain, created_by, status, requested_count,
        success_count, failed_count, unknown_count, currency, total_amount
      ) VALUES (?, ?, ?, 'PENDING', ?, 0, 0, 0, ?, ?)
    `).run(jobId, storeDomain || config.store_domain, createdBy, requestedCount, currency, totalAmount);

    const insertItemStmt = db.prepare(`
      INSERT INTO bulk_job_items (
        id, job_id, draft_order_id, draft_order_name, customer_name,
        customer_phone, total_amount, currency, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `);

    for (const d of drafts) {
      const itemId = crypto.randomUUID();
      const draftId = d.id || d.draft_order_id;
      const draftName = d.name || d.draft_order_name || '#Draft';
      const custName = d.customer
        ? `${d.customer.firstName || ''} ${d.customer.lastName || ''}`.trim()
        : d.customer_name || 'Guest Customer';
      const custPhone = d.phone || d.customer?.phone || d.customer_phone || '';
      const amt = parseFloat(d.totalPriceSet?.shopMoney?.amount || d.total_amount || 0);

      insertItemStmt.run(itemId, jobId, draftId, draftName, custName, custPhone, amt, currency);
    }

    logAudit({
      actor: createdBy,
      action: 'BULK_JOB_CREATED',
      targetType: 'BULK_JOB',
      targetId: jobId,
      metadata: { requestedCount, totalAmount, currency },
      ipAddress
    });

    return this.getJob(jobId);
  }

  getJob(jobId) {
    const db = getDb();
    const job = db.prepare('SELECT * FROM bulk_jobs WHERE id = ?').get(jobId);
    if (!job) return null;

    const items = db.prepare('SELECT * FROM bulk_job_items WHERE job_id = ? ORDER BY created_at ASC').all(jobId);
    return { ...job, items };
  }

  getRecentJobs(limit = 20) {
    const db = getDb();
    return db.prepare('SELECT * FROM bulk_jobs ORDER BY created_at DESC LIMIT ?').all(limit);
  }

  async startJob(jobId, actor = 'system', ipAddress = null) {
    const db = getDb();
    const job = this.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === 'RUNNING') {
      return job; // already in flight
    }

    if (job.status !== 'PENDING') {
      throw new Error(`Job cannot be started from status: ${job.status}`);
    }

    db.prepare(`
      UPDATE bulk_jobs 
      SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(jobId);

    logAudit({
      actor,
      action: 'BULK_JOB_STARTED',
      targetType: 'BULK_JOB',
      targetId: jobId,
      ipAddress
    });

    // Run execution asynchronously without blocking caller
    this.processJobLoop(jobId, actor).catch(err => {
      console.error(`[Queue Error] Job ${jobId} failure:`, err);
    });

    return this.getJob(jobId);
  }

  async processJobLoop(jobId, actor) {
    this.activeWorkers.set(jobId, true);
    const config = getConfig();
    const db = getDb();

    try {
      while (this.activeWorkers.get(jobId)) {
        // Check for cancellation
        const currentJob = db.prepare('SELECT status FROM bulk_jobs WHERE id = ?').get(jobId);
        if (!currentJob || currentJob.status === 'CANCELLED') {
          break;
        }

        // Fetch next PENDING item
        const item = db.prepare(`
          SELECT * FROM bulk_job_items 
          WHERE job_id = ? AND status = 'PENDING' 
          LIMIT 1
        `).get(jobId);

        if (!item) {
          // No more items
          break;
        }

        // 1. Acquire processing claim
        db.prepare(`
          UPDATE bulk_job_items 
          SET status = 'PROCESSING', attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(item.id);

        // 2. Call Shopify mutation
        try {
          const result = await shopifyClient.completeDraftOrder(item.draft_order_id, config.cod_payment_gateway_id);

          if (result.userErrors && result.userErrors.length > 0) {
            const errMsg = result.userErrors.map(e => e.message).join(' | ');
            const errField = result.userErrors[0]?.field?.join('.') || 'mutation';

            db.prepare(`
              UPDATE bulk_job_items 
              SET status = 'FAILED', error_code = ?, error_message = ? 
              WHERE id = ?
            `).run(errField, errMsg, item.id);

            db.prepare('UPDATE bulk_jobs SET failed_count = failed_count + 1 WHERE id = ?').run(jobId);
          } else if (result.draftOrder && result.draftOrder.order) {
            const order = result.draftOrder.order;
            const gatewayNames = Array.isArray(order.paymentGatewayNames)
              ? order.paymentGatewayNames.join(', ')
              : 'COD';

            db.prepare(`
              UPDATE bulk_job_items 
              SET status = 'SUCCEEDED', 
                  shopify_order_id = ?, 
                  shopify_order_name = ?, 
                  payment_gateway_names = ?, 
                  display_financial_status = ? 
              WHERE id = ?
            `).run(order.id, order.name, gatewayNames, order.displayFinancialStatus || 'PENDING', item.id);

            db.prepare('UPDATE bulk_jobs SET success_count = success_count + 1 WHERE id = ?').run(jobId);
          } else {
            db.prepare(`
              UPDATE bulk_job_items 
              SET status = 'FAILED', error_code = 'NO_ORDER_RETURNED', error_message = 'Shopify did not return an order object.' 
              WHERE id = ?
            `).run(item.id);

            db.prepare('UPDATE bulk_jobs SET failed_count = failed_count + 1 WHERE id = ?').run(jobId);
          }
        } catch (callErr) {
          if (callErr.isTimeout || callErr.code === 'ETIMEDOUT' || callErr.code === 'ECONNRESET') {
            // UNKNOWN outcome: response lost, do not retry blindly
            db.prepare(`
              UPDATE bulk_job_items 
              SET status = 'UNKNOWN', error_code = 'TIMEOUT', error_message = ? 
              WHERE id = ?
            `).run(callErr.message, item.id);

            db.prepare('UPDATE bulk_jobs SET unknown_count = unknown_count + 1 WHERE id = ?').run(jobId);
          } else {
            console.error('[Mutation Error]', callErr);
            db.prepare(`
              UPDATE bulk_job_items 
              SET status = 'FAILED', error_code = ?, error_message = ? 
              WHERE id = ?
            `).run(callErr.code || 'HTTP_ERROR', callErr.message || 'Mutation failed', item.id);

            db.prepare('UPDATE bulk_jobs SET failed_count = failed_count + 1 WHERE id = ?').run(jobId);
          }
        }

        // Rate limit spacing delay
        if (config.rate_limit_delay_ms > 0) {
          await new Promise(resolve => setTimeout(resolve, config.rate_limit_delay_ms));
        }
      }

      // Finalize job status
      const updatedJob = this.getJob(jobId);
      if (updatedJob && updatedJob.status !== 'CANCELLED') {
        let finalStatus = 'COMPLETED';
        if (updatedJob.failed_count > 0 || updatedJob.unknown_count > 0) {
          finalStatus = updatedJob.success_count > 0 ? 'PARTIALLY_FAILED' : 'FAILED';
        }

        db.prepare(`
          UPDATE bulk_jobs 
          SET status = ?, completed_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(finalStatus, jobId);

        logAudit({
          actor,
          action: 'BULK_JOB_COMPLETED',
          targetType: 'BULK_JOB',
          targetId: jobId,
          metadata: {
            finalStatus,
            success: updatedJob.success_count,
            failed: updatedJob.failed_count,
            unknown: updatedJob.unknown_count
          }
        });
      }
    } finally {
      this.activeWorkers.delete(jobId);
    }
  }

  cancelJob(jobId, actor = 'system', ipAddress = null) {
    const db = getDb();
    const job = this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    this.activeWorkers.delete(jobId);

    db.prepare(`
      UPDATE bulk_job_items 
      SET status = 'CANCELLED', error_message = 'Job cancelled by staff operator.' 
      WHERE job_id = ? AND status = 'PENDING'
    `).run(jobId);

    db.prepare(`
      UPDATE bulk_jobs 
      SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(jobId);

    logAudit({
      actor,
      action: 'BULK_JOB_CANCELLED',
      targetType: 'BULK_JOB',
      targetId: jobId,
      ipAddress
    });

    return this.getJob(jobId);
  }
}

export const jobQueue = new JobQueue();

