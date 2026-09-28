const rateLimit = require('express-rate-limit');

const GENERIC_RATE_LIMIT_ERROR = 'Too many requests. Please try again later.';

const CHANGE_PASSWORD_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  limit: 5
};

const REFRESH_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  limit: 30
};

const PERSONNEL_INVITATION_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  limit: 10
};

const authenticatedRateLimiter = (options) => {
  const limiter = rateLimit({
    ...options,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    message: { error: GENERIC_RATE_LIMIT_ERROR },
    handler: (req, res) => {
      res.status(429).json({ error: GENERIC_RATE_LIMIT_ERROR });
    }
  });

  return function authenticatedRateLimit(req, res, next) {
    if (!req.user || typeof req.user.id !== 'string' || req.user.id.trim() === '') {
      return res.status(401).json({ error: 'Authentication required' });
    }

    return limiter(req, res, next);
  };
};

module.exports = {
  authenticatedRateLimiter,
  CHANGE_PASSWORD_RATE_LIMIT,
  REFRESH_RATE_LIMIT,
  PERSONNEL_INVITATION_RATE_LIMIT
};
