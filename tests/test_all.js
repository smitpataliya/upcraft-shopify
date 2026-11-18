// Comprehensive Automated Test Suite for Upcraft Shopify
// Covers all scenarios outlined in Section 13 of the guide.

import assert from 'node:assert';
import { getDb, getConfig, updateConfig, hashPassword, verifyPassword } from '../src/server/db.js';
import { shopifyClient } from '../src/server/shopify.js';
import { jobQueue } from '../src/server/queue.js';
import { reconcileJobItem } from '../src/server/reconciliation.js';
import { loginUser } from '../src/server/auth.js';
import { mockShopifyStore } from '../src/server/mock-data.js';

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

console.log('\n=============================================================');
console.log('🧪 RUNNING UPCRAFT SHOPIFY AUTOMATED TEST SUITE');
console.log('=============================================================\n');

// Ensure hermetic test environment: use mock simulator mode for unit tests
const initialConfig = getConfig();
updateConfig({ mock_mode: 1 });

// 1. Password & Auth Tests
runTest('Staff Authentication: Password hashing & verification', () => {
  const hash = hashPassword('TestSecret2026!');
  assert(verifyPassword('TestSecret2026!', hash), 'Valid password must verify');
  assert(!verifyPassword('WrongSecret', hash), 'Invalid password must fail');
});

runTest('Staff Login: Default admin credentials', () => {
  const result = loginUser('admin', 'Upcraft2026!');
  assert(result.success, 'Admin login must succeed');
  assert.strictEqual(result.user.role, 'ADMIN', 'Role must be ADMIN');
  assert(result.token, 'Session token must be generated');
});

// 2. Draft Orders Retrieval & Pagination
await runAsyncTest('API & Scopes: Fetch open draft orders', async () => {
  const result = await shopifyClient.getDraftOrders({ first: 10 });
  assert(result.nodes && result.nodes.length > 0, 'Nodes must contain drafts');
  assert.strictEqual(result.nodes[0].status, 'OPEN', 'Draft must be OPEN');
});

await runAsyncTest('Pagination: Cursor-based navigation', async () => {
  const page1 = await shopifyClient.getDraftOrders({ first: 5 });
  assert.strictEqual(page1.nodes.length, 5, 'Page 1 must have 5 items');
  assert(page1.pageInfo.hasNextPage, 'Must have next page');

  const page2 = await shopifyClient.getDraftOrders({ first: 5, after: page1.pageInfo.endCursor });
  assert.strictEqual(page2.nodes.length, 5, 'Page 2 must have 5 items');
  assert.notStrictEqual(page1.nodes[0].id, page2.nodes[0].id, 'Page 2 items must differ from Page 1');
});

// 3. Selection Cap (70 items max)
runTest('Selection Cap: Reject selection > 70 drafts', () => {
  const dummyDrafts = Array.from({ length: 71 }, (_, i) => ({
    id: `gid://shopify/DraftOrder/dummy_${i}`,
    name: `#D${i}`,
    totalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'INR' } }
  }));

  assert.throws(
    () => {
      jobQueue.createBulkJob({ createdBy: 'test_operator', drafts: dummyDrafts });
    },
    /exceeds maximum batch limit of 70/,
    'Must throw error when batch exceeds 70 items'
  );
});

// 4. Single COD Test Run
await runAsyncTest('Single COD Test: Completes 1 draft, returns UNPAID status', async () => {
  const drafts = await shopifyClient.getDraftOrders({ first: 1 });
  const targetDraft = drafts.nodes[0];

  const result = await shopifyClient.completeDraftOrder(targetDraft.id, 'Cash on Delivery (COD)');
  assert(result.draftOrder, 'Draft order must be returned');
  assert.strictEqual(result.draftOrder.status, 'COMPLETED', 'Status must be COMPLETED');
  assert(result.draftOrder.order, 'Order must be created');
  assert.strictEqual(result.draftOrder.order.displayFinancialStatus, 'PENDING', 'Financial status must remain PENDING / UNPAID');
  assert(result.draftOrder.order.paymentGatewayNames.includes('Cash on Delivery (COD)'), 'Must have COD gateway name');
});

// 5. Bulk Job Lifecycle
await runAsyncTest('Bulk Job Lifecycle: Create, claim, and process 5 drafts', async () => {
  const draftsResult = await shopifyClient.getDraftOrders({ first: 5 });
  const selectedDrafts = draftsResult.nodes;

  const job = jobQueue.createBulkJob({
    createdBy: 'test_admin',
    drafts: selectedDrafts,
    storeDomain: 'test-store.myshopify.com'
  });

  assert.strictEqual(job.status, 'PENDING', 'Job initial status must be PENDING');
  assert.strictEqual(job.requested_count, 5, 'Requested count must be 5');

  const startedJob = await jobQueue.startJob(job.id, 'test_admin');
  assert.strictEqual(startedJob.status, 'RUNNING', 'Job status must be RUNNING');

  // Wait for queue processing to complete
  let attempts = 0;
  let finalJob = jobQueue.getJob(job.id);
  while (finalJob.status === 'RUNNING' && attempts < 20) {
    await new Promise(r => setTimeout(r, 200));
    finalJob = jobQueue.getJob(job.id);
    attempts++;
  }

  assert(finalJob.status === 'COMPLETED' || finalJob.status === 'PARTIALLY_FAILED', `Job status must be finished, got ${finalJob.status}`);
  assert(finalJob.success_count > 0, 'Must have at least 1 successful draft completion');
});

// 6. UserError Simulation (Out of Stock)
await runAsyncTest('Shopify UserError: Out of stock inventory failure handled gracefully', async () => {
  // Mock store item 40 has tag TEST_OUT_OF_STOCK
  const outOfStockDraftId = 'gid://shopify/DraftOrder/9100000040';
  const result = await shopifyClient.completeDraftOrder(outOfStockDraftId);

  assert(result.userErrors && result.userErrors.length > 0, 'Must return userErrors');
  assert(result.userErrors[0].message.includes('Inventory not available'), 'Error message must reflect stock failure');
});

// 7. Timeout Simulation & Reconciliation
await runAsyncTest('Timeout Reconciliation: UNKNOWN state item safely reconciled without duplicate', async () => {
  // Create a job item directly with UNKNOWN status
  const db = getDb();
  const testJobId = 'test-job-timeout-' + Date.now();
  const testItemId = 'test-item-timeout-' + Date.now();
  const draftId = 'gid://shopify/DraftOrder/9100000002'; // Already completed draft

  db.prepare(`
    INSERT INTO bulk_jobs (id, store_domain, created_by, status, requested_count, unknown_count)
    VALUES (?, 'test.myshopify.com', 'test_worker', 'RUNNING', 1, 1)
  `).run(testJobId);

  db.prepare(`
    INSERT INTO bulk_job_items (id, job_id, draft_order_id, draft_order_name, status, error_code, error_message)
    VALUES (?, ?, ?, '#D1002', 'UNKNOWN', 'TIMEOUT', 'Simulated gateway timeout')
  `).run(testItemId, testJobId, draftId);

  const reconResult = await reconcileJobItem(testItemId, 'test_reconciler');
  assert(reconResult.success, 'Reconciliation must succeed');

  const updatedItem = db.prepare('SELECT * FROM bulk_job_items WHERE id = ?').get(testItemId);
  assert(updatedItem.status === 'SUCCEEDED' || updatedItem.status === 'PENDING', `Status must be reconciled, got ${updatedItem.status}`);
  assert(updatedItem.reconciled_at, 'reconciled_at timestamp must be set');
});

// 8. Audit Event Logging
runTest('Audit Trail: Verification of recorded operations', () => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 5').all();
  assert(logs.length > 0, 'Audit logs must be present');
  assert(logs[0].actor, 'Audit event must have an actor');
  assert(logs[0].action, 'Audit event must record an action');
});

// Restore previous runtime mode
updateConfig({ mock_mode: initialConfig.mock_mode ? 1 : 0 });

console.log('\n=============================================================');
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('=============================================================\n');

if (failed > 0) {
  process.exit(1);
}
