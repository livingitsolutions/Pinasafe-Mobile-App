const cors = require('cors');

const invalidCorsOrigin = () => {
  throw new Error('Invalid backend configuration: CORS_ORIGIN');
};

const parseCorsOrigins = (rawOrigins) => {
  if (typeof rawOrigins !== 'string' || rawOrigins.trim() === '') {
    return invalidCorsOrigin();
  }

  const origins = rawOrigins.split(',').map((origin) => {
    const candidate = origin.trim();

    if (!candidate || candidate === '*') {
      return invalidCorsOrigin();
    }

    let parsedOrigin;
    try {
      parsedOrigin = new URL(candidate);
    } catch (error) {
      return invalidCorsOrigin();
    }

    if (
      !['http:', 'https:'].includes(parsedOrigin.protocol)
      || parsedOrigin.username
      || parsedOrigin.password
      || (parsedOrigin.pathname !== '' && parsedOrigin.pathname !== '/')
      || parsedOrigin.search
      || parsedOrigin.hash
    ) {
      return invalidCorsOrigin();
    }

    return parsedOrigin.origin;
  });

  return [...new Set(origins)];
};

const createCorsMiddleware = (allowedOrigins) => {
  const allowedOriginSet = new Set(allowedOrigins);
  const corsHandler = cors({
    origin: (requestOrigin, callback) => {
      callback(null, !requestOrigin || allowedOriginSet.has(requestOrigin));
    },
    credentials: true
  });

  return (req, res, next) => {
    const requestOrigin = req.get('Origin');

    if (requestOrigin && !allowedOriginSet.has(requestOrigin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }

    return corsHandler(req, res, next);
  };
};

module.exports = {
  parseCorsOrigins,
  createCorsMiddleware
};
