const express = require('express');
const request = require('supertest');
const authRouter = require('../routes/auth');
const emergencyRouter = require('../routes/emergency');
const locationTrackingRouter = require('../routes/location-tracking');
const personnelRouter = require('../routes/personnel');
const {
  authenticatedRateLimiter,
  CHANGE_PASSWORD_RATE_LIMIT,
  REFRESH_RATE_LIMIT,
  PERSONNEL_INVITATION_RATE_LIMIT
} = require('../middleware/authenticatedRateLimit');

const buildIdentityApp = (policy, identity = 'user-1') => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = identity === null ? {} : { id: req.get('X-Test-User') || identity };
    next();
  });
  app.post('/test/:pathUserId', authenticatedRateLimiter(policy), (req, res) => {
    res.json({ ok: true });
  });
  return app;
};

const sendRequest = (app, userId, index = 0) => request(app)
  .post(`/test/path-user-${index}`)
  .set('X-Test-User', userId)
  .set('X-Forwarded-For', `198.51.100.${index + 1}`)
  .query({ userId: `query-user-${index}` })
  .send({ userId: `body-user-${index}`, token: 'test-token' });

const routeHandlerNames = (router, path) => {
  const layer = router.stack.find((item) => item.route?.path === path);
  return layer?.route?.stack.map((item) => item.handle.name) || [];
};

describe('authenticated identity rate limiting', () => {
  test('limits change-password identities at five requests per hour', async () => {
    const app = buildIdentityApp(CHANGE_PASSWORD_RATE_LIMIT);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(sendRequest(app, 'user-1', attempt)).resolves.toHaveProperty('status', 200);
    }

    const response = await sendRequest(app, 'user-1', 5);
    expect(response.status).toBe(429);
  });

  test('keeps refresh counters independent per verified identity', async () => {
    const app = buildIdentityApp(REFRESH_RATE_LIMIT);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(sendRequest(app, 'user-1', attempt)).resolves.toHaveProperty('status', 200);
    }

    expect((await sendRequest(app, 'user-1', 30)).status).toBe(429);
    expect((await sendRequest(app, 'user-2', 30)).status).toBe(200);
  });

  test('limits personnel invitation issuance at ten requests per hour', async () => {
    const app = buildIdentityApp(PERSONNEL_INVITATION_RATE_LIMIT);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(sendRequest(app, 'admin-1', attempt)).resolves.toHaveProperty('status', 200);
    }

    expect((await sendRequest(app, 'admin-1', 10)).status).toBe(429);
    expect((await sendRequest(app, 'admin-2', 10)).status).toBe(200);
  });

  test('uses only verified identity and ignores body, path, query, and forwarded headers', async () => {
    const app = buildIdentityApp({ windowMs: 60 * 60 * 1000, limit: 2 });

    expect((await sendRequest(app, 'user-1', 1)).status).toBe(200);
    expect((await sendRequest(app, 'user-1', 2)).status).toBe(200);
    expect((await sendRequest(app, 'user-1', 3)).status).toBe(429);
  });

  test('fails closed without creating an anonymous shared bucket', async () => {
    const app = buildIdentityApp({ windowMs: 60 * 60 * 1000, limit: 1 }, null);

    expect((await sendRequest(app, 'user-1')).status).toBe(401);
    expect((await sendRequest(app, 'user-2')).status).toBe(401);
  });

  test('returns a generic 429 with retry and standard rate-limit headers', async () => {
    const app = buildIdentityApp({ windowMs: 60 * 60 * 1000, limit: 1 });

    expect((await sendRequest(app, 'user-1')).status).toBe(200);
    const response = await sendRequest(app, 'user-1');

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: 'Too many requests. Please try again later.' });
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.headers.ratelimit || response.headers['ratelimit-limit']).toBeDefined();
    expect(response.text).not.toContain('user-1');
    expect(response.text).not.toContain('test-token');
  });

  test('places limiters after authentication on approved routes only', () => {
    const approvedRoutes = [
      [authRouter, '/change-password'],
      [authRouter, '/refresh'],
      [personnelRouter, '/invitations']
    ];

    approvedRoutes.forEach(([router, path]) => {
      const names = routeHandlerNames(router, path);
      const authIndex = names.indexOf('authenticateToken');
      const limiterIndex = names.indexOf('authenticatedRateLimit');

      expect(authIndex).toBeGreaterThanOrEqual(0);
      expect(limiterIndex).toBeGreaterThan(authIndex);
    });

    expect(routeHandlerNames(emergencyRouter, '/')).not.toContain('authenticatedRateLimit');
    expect(routeHandlerNames(locationTrackingRouter, '/update/:emergencyId'))
      .not.toContain('authenticatedRateLimit');
  });
});
