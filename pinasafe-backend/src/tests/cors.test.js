const express = require('express');
const request = require('supertest');
const { createCorsMiddleware } = require('../config/cors');

const buildApp = () => {
  const app = express();
  app.use(createCorsMiddleware(['http://localhost:8081', 'https://example.com']));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  return app;
};

describe('CORS request behavior', () => {
  test('allows an approved origin with credentials', async () => {
    const response = await request(buildApp())
      .get('/health')
      .set('Origin', 'http://localhost:8081');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('denies a disallowed origin without echoing it', async () => {
    const rejectedOrigin = 'https://attacker.example';
    const response = await request(buildApp())
      .get('/health')
      .set('Origin', rejectedOrigin);

    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.text).not.toContain(rejectedOrigin);
  });

  test('allows requests without an Origin header', async () => {
    const response = await request(buildApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('allows approved OPTIONS preflight requests', async () => {
    const response = await request(buildApp())
      .options('/health')
      .set('Origin', 'https://example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://example.com');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('denies disallowed OPTIONS preflight requests without echoing the origin', async () => {
    const rejectedOrigin = 'https://attacker.example';
    const response = await request(buildApp())
      .options('/health')
      .set('Origin', rejectedOrigin)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.text).not.toContain(rejectedOrigin);
  });
});
