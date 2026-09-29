const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../config/database', () => ({
  getClient: jest.fn()
}));

const { getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const authRouter = require('../routes/auth');
const {
  ACCESS_TOKEN_ALGORITHM,
  extractBearerToken,
  signAccessToken,
  verifyAccessToken
} = require('../utils/jwt');

const TEST_SECRET = 'synthetic-jwt-secret-for-tests-32-chars';

const buildUserQuery = (user) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: user, error: null })
});

const buildProtectedApp = () => {
  const app = express();
  app.get('/protected', authenticateToken, (req, res) => {
    res.json({ user: req.user });
  });
  return app;
};

const tokenFor = (claims = {}) => signAccessToken({
  userId: 'user-1',
  email: 'token@example.com',
  role: 'citizen',
  ...claims
});

describe('JWT policy', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    delete process.env.JWT_EXPIRES_IN;
    jest.clearAllMocks();
    getClient.mockReturnValue({
      from: jest.fn(() => buildUserQuery({
        id: 'user-1',
        email: 'authoritative@example.com',
        role: 'admin',
        organization_id: 'org-1'
      }))
    });
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
  });

  test('signs HS256 tokens with the existing claims and expiration', () => {
    const token = signAccessToken({
      userId: 'user-1',
      email: 'user@example.com',
      role: 'responder'
    });
    const decoded = jwt.decode(token, { complete: true });

    expect(decoded.header.alg).toBe(ACCESS_TOKEN_ALGORITHM);
    expect(decoded.payload).toMatchObject({
      userId: 'user-1',
      email: 'user@example.com',
      role: 'responder'
    });
    expect(decoded.payload.iat).toEqual(expect.any(Number));
    expect(decoded.payload.exp).toEqual(expect.any(Number));
  });

  test('verifies valid HS256 tokens', () => {
    expect(verifyAccessToken(tokenFor())).toMatchObject({
      userId: 'user-1',
      email: 'token@example.com',
      role: 'citizen'
    });
  });

  test('rejects a token with the wrong signature', () => {
    const token = jwt.sign(
      { userId: 'user-1' },
      'different-synthetic-secret-32-chars',
      { algorithm: ACCESS_TOKEN_ALGORITHM }
    );

    expect(() => verifyAccessToken(token)).toThrow();
  });

  test('rejects expired tokens', () => {
    const token = jwt.sign(
      { userId: 'user-1' },
      TEST_SECRET,
      { algorithm: ACCESS_TOKEN_ALGORITHM, expiresIn: -1 }
    );

    expect(() => verifyAccessToken(token)).toThrow(/expired/i);
  });

  test('rejects tokens signed with another algorithm', () => {
    const token = jwt.sign(
      { userId: 'user-1' },
      TEST_SECRET,
      { algorithm: 'HS384' }
    );

    expect(() => verifyAccessToken(token)).toThrow();
  });

  test('extracts only a strict, case-insensitive Bearer token', () => {
    expect(extractBearerToken('Bearer synthetic-token')).toBe('synthetic-token');
    expect(extractBearerToken('bEaReR synthetic-token')).toBe('synthetic-token');
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken('Basic synthetic-token')).toBeNull();
    expect(extractBearerToken('Bearer synthetic-token extra')).toBeNull();
    expect(extractBearerToken('Bearer  synthetic-token')).toBeNull();
  });

  test.each([
    undefined,
    'Bearer',
    'Basic synthetic-token',
    'Bearer synthetic-token extra'
  ])('rejects malformed Authorization header %j', async (authorization) => {
    const requestBuilder = request(buildProtectedApp()).get('/protected');
    if (authorization) requestBuilder.set('Authorization', authorization);

    const response = await requestBuilder;

    expect(response.status).toBe(401);
    expect(response.text).not.toContain('synthetic-token');
    expect(getClient).not.toHaveBeenCalled();
  });

  test('accepts valid Bearer credentials and reloads authoritative user data', async () => {
    const response = await request(buildProtectedApp())
      .get('/protected')
      .set('Authorization', `BEARER ${tokenFor({
        email: 'stale@example.com',
        role: 'citizen'
      })}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: 'user-1',
      email: 'authoritative@example.com',
      role: 'admin',
      organization_id: 'org-1'
    });
  });

  test('expired access tokens cannot pass authenticateToken', async () => {
    const token = jwt.sign(
      { userId: 'user-1' },
      TEST_SECRET,
      { algorithm: ACCESS_TOKEN_ALGORITHM, expiresIn: -1 }
    );

    const response = await request(buildProtectedApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Token expired' });
    expect(getClient).not.toHaveBeenCalled();
  });

  test('invalid JWT returns 401 not 403', async () => {
    const response = await request(buildProtectedApp())
      .get('/protected')
      .set('Authorization', 'Bearer not-a-valid-jwt');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid token' });
    expect(getClient).not.toHaveBeenCalled();
  });

  test('refresh keeps authentication, limiter, and response contract ordering', async () => {
    const route = authRouter.stack.find((layer) => layer.route?.path === '/refresh');
    const handlers = route.route.stack.map((layer) => layer.handle.name);

    expect(handlers.indexOf('authenticateToken')).toBeGreaterThanOrEqual(0);
    expect(handlers.indexOf('authenticatedRateLimit'))
      .toBeGreaterThan(handlers.indexOf('authenticateToken'));

    const response = await request(express().use('/api/auth', authRouter))
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Token refreshed successfully');
    expect(typeof response.body.token).toBe('string');
  });
});
