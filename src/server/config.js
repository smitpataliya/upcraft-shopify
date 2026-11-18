import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const DATA_DIR = path.resolve(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:4000',
  sessionSecret: process.env.SESSION_SECRET || 'upcraft-shopify-secure-session-key-2026',
  
  // Database configuration
  dbPath: process.env.DB_PATH || path.join(DATA_DIR, 'upcraft_shopify.db'),
  
  // Shopify defaults
  shopifyStore: process.env.SHOPIFY_STORE || 'upcraft-cod-demo.myshopify.com',
  shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN || '',
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION || '2026-10',
  
  // COD Marker rules
  codMarkerType: process.env.COD_MARKER_TYPE || 'TAG', // 'TAG', 'NOTE_ATTRIBUTE', 'ANY'
  codMarkerValue: process.env.COD_MARKER_VALUE || 'COD',
  codPaymentGatewayId: process.env.COD_PAYMENT_GATEWAY_ID || null,
  
  // Safety limits
  maxBatchSize: 70,
  minBatchSize: 1,
  rateLimitDelayMs: parseInt(process.env.RATE_LIMIT_DELAY_MS || '400', 10),
  
  // Mock simulation mode
  mockMode: process.env.MOCK_MODE === 'true' || !process.env.SHOPIFY_ACCESS_TOKEN,
};

