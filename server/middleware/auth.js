const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'forecastrange-dev-secret';

/**
 * Optional auth middleware — attaches req.user if token present.
 * Does NOT block unauthenticated requests (web app still works without auth).
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
      req.user = { id: decoded.sub };
    } catch {
      // Invalid token — proceed as unauthenticated
    }
  }
  next();
}

/**
 * Required auth middleware — blocks unauthenticated requests.
 * Use on iOS-only endpoints (watchlist, preferences, etc.).
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    req.user = { id: decoded.sub };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { optionalAuth, requireAuth };
