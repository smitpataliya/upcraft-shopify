// Staff Authentication & Role-Based Access Control (RBAC)
// Manages session tokens and role guards (ADMIN vs OPERATOR)

import crypto from 'node:crypto';
import { getDb, verifyPassword } from './db.js';

// In-memory active session tokens: token -> { userId, username, role, fullName, expiresAt }
const sessions = new Map();

export function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionData = {
    userId: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
    email: user.email,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  };
  sessions.set(token, sessionData);
  return { token, user: sessionData };
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function revokeSession(token) {
  if (token) sessions.delete(token);
}

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  const session = getSession(token);
  if (session) {
    req.user = session;
    return next();
  }

  // Allow anonymous development / initial access fallback if needed, or require auth
  // For production security: require login
  return res.status(401).json({
    success: false,
    error: 'UNAUTHORIZED',
    message: 'Staff authentication required. Please log in.'
  });
}

export function requireRole(allowedRoles = ['ADMIN']) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
}

export function loginUser(username, password) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM staff_users WHERE username = ? AND is_active = 1').get(username);
  if (!user) {
    return { success: false, message: 'Invalid username or password' };
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    return { success: false, message: 'Invalid username or password' };
  }

  const { token, user: sessionData } = createSession(user);
  return { success: true, token, user: sessionData };
}

