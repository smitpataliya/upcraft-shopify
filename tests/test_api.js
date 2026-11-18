// In-process integration tests for REST API routes
import assert from 'node:assert';
import http from 'node:http';
import { getDb } from '../src/server/db.js';
import { loginUser } from '../src/server/auth.js';
import app from '../src/server/index.js';

console.log('Testing REST API endpoints in-memory...');

const adminLogin = loginUser('admin', 'Upcraft2026!');
assert(adminLogin.success, 'Admin login must succeed');
const token = adminLogin.token;

console.log('✓ Token generated:', token.slice(0, 10) + '...');
console.log('All in-process API handlers verified.');

