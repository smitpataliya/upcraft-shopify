import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const esbuild = require('D:/Upcraft/workspace/upcraft-admin-panel/node_modules/esbuild');

console.log('Building React SPA for Upcraft Shopify...');

try {
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'src/client/src/index.jsx')],
    bundle: true,
    outfile: path.join(__dirname, 'src/client/bundle.js'),
    format: 'esm',
    jsx: 'automatic',
    nodePaths: ['D:/Upcraft/workspace/upcraft-admin-panel/node_modules'],
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    minify: false,
    sourcemap: false
  });

  console.log('Bundle created successfully at src/client/bundle.js!');
} catch (err) {
  console.error('Build failed:', err);
  process.exit(1);
}
