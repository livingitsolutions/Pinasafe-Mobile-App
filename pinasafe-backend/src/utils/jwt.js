const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_ALGORITHM = 'HS256';

const getJwtSecret = () => process.env.JWT_SECRET;

const signAccessToken = (claims) => jwt.sign(
  claims,
  getJwtSecret(),
  {
    algorithm: ACCESS_TOKEN_ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  }
);

const verifyAccessToken = (token) => jwt.verify(
  token,
  getJwtSecret(),
  { algorithms: [ACCESS_TOKEN_ALGORITHM] }
);

const extractBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer ([^\s]+)$/i);
  return match ? match[1] : null;
};

module.exports = {
  ACCESS_TOKEN_ALGORITHM,
  extractBearerToken,
  signAccessToken,
  verifyAccessToken
};
