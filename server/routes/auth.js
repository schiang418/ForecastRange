const express = require('express');
const jwt = require('jsonwebtoken');
const appleSignin = require('apple-signin-auth');
const fetch = require('node-fetch');
const { OAuth2Client } = require('google-auth-library');
const { getDb, ensureAuthTables } = require('../db');
const { sql } = require('drizzle-orm');

// Fix: Node 18+ built-in fetch (undici) fails on some platforms (Railway).
// Inject node-fetch instead so Apple public key retrieval works reliably.
appleSignin._setFetch(fetch);

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'forecastrange-dev-secret';
const JWT_EXPIRES_IN = '30d';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID;
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').filter(Boolean);
const GOOGLE_AUDIENCES = [GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID].filter(Boolean);

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ── helpers ──────────────────────────────────────────────────

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function findOrCreateUser(provider, providerId, email, name) {
  await ensureAuthTables();
  const db = getDb();

  // Try to find existing user
  const existing = await db.execute(
    sql`SELECT id, email, name FROM users WHERE provider = ${provider} AND provider_id = ${providerId} LIMIT 1`
  );

  if (existing.rows && existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Create new user
  const result = await db.execute(
    sql`INSERT INTO users (provider, provider_id, email, name) VALUES (${provider}, ${providerId}, ${email}, ${name}) RETURNING id, email, name`
  );

  return result.rows[0];
}

async function findExistingUser(provider, providerId) {
  await ensureAuthTables();
  const db = getDb();
  const existing = await db.execute(
    sql`SELECT id, email, name FROM users WHERE provider = ${provider} AND provider_id = ${providerId} LIMIT 1`
  );
  return (existing.rows && existing.rows.length > 0) ? existing.rows[0] : null;
}

function checkAllowlist(email) {
  if (ALLOWED_EMAILS.length === 0) return true; // no restriction if empty
  return ALLOWED_EMAILS.includes(email);
}

// ── POST /api/auth/apple ─────────────────────────────────────

router.post('/apple', async (req, res) => {
  try {
    const { identityToken, fullName } = req.body;
    if (!identityToken) {
      return res.status(400).json({ error: 'Missing identityToken' });
    }

    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: process.env.APPLE_BUNDLE_ID,
      ignoreExpiration: false,
    });

    const email = payload.email || null;
    const name = fullName?.givenName
      ? `${fullName.givenName} ${fullName.familyName || ''}`.trim()
      : null;

    // Allow returning users even if their email doesn't match the allowlist
    // (e.g. Apple relay emails, or email hidden on subsequent sign-ins)
    const existingUser = await findExistingUser('apple', payload.sub);
    if (!existingUser && !checkAllowlist(email)) {
      return res.status(403).json({ error: 'Access restricted' });
    }

    const user = existingUser || await findOrCreateUser('apple', payload.sub, email, name);
    const token = signToken(user.id);

    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('[auth/apple] Error:', err.message, err.stack?.split('\n')[1]?.trim());
    const msg = err.message?.includes('audience')
      ? 'Bundle ID mismatch — check APPLE_BUNDLE_ID env var'
      : err.message?.includes('expired')
        ? 'Apple token expired'
        : 'Invalid Apple identity token';
    res.status(401).json({ error: msg });
  }
});

// ── POST /api/auth/google ────────────────────────────────────

router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_AUDIENCES,
    });

    const payload = ticket.getPayload();
    const email = payload.email || null;
    const name = payload.name || null;

    if (!checkAllowlist(email)) {
      return res.status(403).json({ error: 'Access restricted' });
    }

    const user = await findOrCreateUser('google', payload.sub, email, name);
    const token = signToken(user.id);

    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('[auth/google] Error:', err.message);
    res.status(401).json({ error: 'Invalid Google ID token' });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────

router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing token' });
    }

    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET, { ignoreExpiration: true });
    const token = signToken(decoded.sub);

    res.json({ token });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing token' });
    }

    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    await ensureAuthTables();
    const db = getDb();

    const result = await db.execute(
      sql`SELECT id, email, name, provider, created_at FROM users WHERE id = ${decoded.sub} LIMIT 1`
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
