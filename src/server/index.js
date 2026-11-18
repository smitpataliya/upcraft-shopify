// Upcraft Shopify Application Server
// Node.js + Express + SQLite Core Engine

import { express, cors } from './deps.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getDb, getConfig } from './db.js';
import { router as apiRouter } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.resolve(__dirname, '../client');

const app = express();

// Initialize DB schema & seed on startup
getDb();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static assets from src/client
app.use(express.static(CLIENT_DIR));

// Mount REST API
app.use('/api', apiRouter);

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', path: req.path });
  }
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// Start listener
const server = app.listen(config.port, config.host, () => {
  const currentConfig = getConfig();
  console.log(`
=================================================================
  🚀 UPCRAFT SHOPIFY — BULK COD DRAFT CONFIRMATION ENGINE
=================================================================
  • URL:          http://localhost:${config.port}
  • API Target:   Shopify Admin GraphQL ${currentConfig.api_version}
  • Store Domain: ${currentConfig.store_domain}
  • Runtime Mode: ${currentConfig.mock_mode ? '🟢 MOCK SIMULATOR (Zero-Risk Demo)' : '🔵 LIVE SHOPIFY ADMIN API'}
  • COD Marker:   ${currentConfig.cod_marker_type} = "${currentConfig.cod_marker_value}"
  • Batch Cap:    ${currentConfig.max_batch_size} orders
  • Staff Logins: 
      Admin:    admin / Upcraft2026!
      Operator: operator / Operator2026!
=================================================================
  `);
});

// Process signal handlers
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => process.exit(0));
});

export default app;
