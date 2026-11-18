import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { config } from './config.js';

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(config.dbPath);
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_domain TEXT NOT NULL,
      access_token TEXT NOT NULL,
      api_version TEXT NOT NULL DEFAULT '2026-10',
      cod_marker_type TEXT NOT NULL DEFAULT 'TAG',
      cod_marker_value TEXT NOT NULL DEFAULT 'COD',
      cod_payment_gateway_id TEXT,
      max_batch_size INTEGER NOT NULL DEFAULT 70,
      rate_limit_delay_ms INTEGER NOT NULL DEFAULT 400,
      mock_mode INTEGER NOT NULL DEFAULT 1,
      client_id TEXT DEFAULT '',
      client_secret TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'OPERATOR',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bulk_jobs (
      id TEXT PRIMARY KEY,
      store_domain TEXT NOT NULL,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_count INTEGER NOT NULL,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      unknown_count INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      total_amount REAL NOT NULL DEFAULT 0.0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bulk_job_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      draft_order_id TEXT NOT NULL,
      draft_order_name TEXT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      total_amount REAL NOT NULL DEFAULT 0.0,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'PENDING',
      shopify_order_id TEXT,
      shopify_order_name TEXT,
      payment_gateway_names TEXT,
      display_financial_status TEXT,
      error_code TEXT,
      error_message TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      reconciled_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES bulk_jobs(id) ON DELETE CASCADE,
      UNIQUE (job_id, draft_order_id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate store_config columns if needed
  try { db.exec('ALTER TABLE store_config ADD COLUMN client_id TEXT DEFAULT ""'); } catch {}
  try { db.exec('ALTER TABLE store_config ADD COLUMN client_secret TEXT DEFAULT ""'); } catch {}

  // Ensure default singleton config
  const existingConfig = db.prepare('SELECT id FROM store_config WHERE id = 1').get();
  if (!existingConfig) {
    db.prepare(`
      INSERT INTO store_config (
        id, store_domain, access_token, api_version, cod_marker_type, 
        cod_marker_value, cod_payment_gateway_id, max_batch_size, 
        rate_limit_delay_ms, mock_mode
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      config.shopifyStore,
      config.shopifyAccessToken,
      config.shopifyApiVersion,
      config.codMarkerType,
      config.codMarkerValue,
      config.codPaymentGatewayId,
      config.maxBatchSize,
      config.rateLimitDelayMs,
      config.mockMode ? 1 : 0
    );
  }

  // Ensure default staff users
  const adminUser = db.prepare('SELECT id FROM staff_users WHERE username = ?').get('admin');
  if (!adminUser) {
    db.prepare(`
      INSERT INTO staff_users (id, username, password_hash, full_name, email, role, is_active)
      VALUES (?, 'admin', ?, 'Operations Lead', 'ops@upcraft.internal', 'ADMIN', 1)
    `).run(crypto.randomUUID(), hashPassword('Upcraft2026!'));
  }

  const operatorUser = db.prepare('SELECT id FROM staff_users WHERE username = ?').get('operator');
  if (!operatorUser) {
    db.prepare(`
      INSERT INTO staff_users (id, username, password_hash, full_name, email, role, is_active)
      VALUES (?, 'operator', ?, 'COD Dispatch Clerk', 'clerk@upcraft.internal', 'OPERATOR', 1)
    `).run(crypto.randomUUID(), hashPassword('Operator2026!'));
  }
}

// Data Access Helpers
export function getConfig() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM store_config WHERE id = 1').get();
  return {
    ...row,
    mock_mode: Boolean(row.mock_mode),
    has_token: Boolean(row.access_token && row.access_token.length > 5)
  };
}

export function updateConfig(updates) {
  const db = getDb();
  const current = getConfig();
  const next = { ...current, ...updates };
  
  db.prepare(`
    UPDATE store_config SET
      store_domain = ?,
      access_token = ?,
      api_version = ?,
      cod_marker_type = ?,
      cod_marker_value = ?,
      cod_payment_gateway_id = ?,
      max_batch_size = ?,
      rate_limit_delay_ms = ?,
      mock_mode = ?,
      client_id = ?,
      client_secret = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(
    next.store_domain,
    updates.access_token !== undefined ? updates.access_token : current.access_token,
    next.api_version,
    next.cod_marker_type,
    next.cod_marker_value,
    next.cod_payment_gateway_id,
    next.max_batch_size,
    next.rate_limit_delay_ms,
    next.mock_mode ? 1 : 0,
    next.client_id || '',
    next.client_secret || ''
  );
  return getConfig();
}

export function logAudit({ actor, action, targetType, targetId, metadata, ipAddress }) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO audit_events (id, actor, action, target_type, target_id, metadata, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    actor || 'system',
    action,
    targetType,
    targetId || null,
    typeof metadata === 'object' ? JSON.stringify(metadata) : metadata || null,
    ipAddress || null
  );
  return id;
}

export function getAuditLogs(limit = 100) {
  const db = getDb();
  return db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?').all(limit);
}

