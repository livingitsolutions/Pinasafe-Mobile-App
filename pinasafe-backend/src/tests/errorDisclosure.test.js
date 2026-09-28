const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  canAccessOrganization: () => true
}));

jest.mock('../config/database', () => ({
  getClient: jest.fn()
}));

const { getClient } = require('../config/database');
const { errorHandler } = require('../middleware/errorHandler');
const { validateLogin } = require('../middleware/validation');
const safeLogger = require('../utils/safeLogger');
const { createRequestLogger } = require('../utils/requestLogger');
const personnelRouter = require('../routes/personnel');
const teamsRouter = require('../routes/teams');

const sensitiveMarker = 'SENSITIVE-ERROR-MARKER';

const buildQuery = (payload) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(payload),
  single: jest.fn().mockResolvedValue(payload),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis()
});

describe('error disclosure and logging safety', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('safe logger retains operation category without serializing errors', () => {
    safeLogger.error('test.operation_failed', 500);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[test.operation_failed] status=500');
    expect(consoleErrorSpy.mock.calls.join(' ')).not.toContain(sensitiveMarker);
  });

  test('global 500 responses omit exception text and stack', async () => {
    const app = express();
    app.get('/failure', () => {
      throw new Error(sensitiveMarker);
    });
    app.use(errorHandler);

    const response = await request(app).get('/failure');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
    expect(response.text).not.toContain(sensitiveMarker);
    expect(response.text).not.toContain('stack');
  });

  test('global handler delegates when headers were already sent', () => {
    const next = jest.fn();
    const error = new Error(sensitiveMarker);

    errorHandler(error, {}, { headersSent: true }, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  test('validation details omit submitted values', async () => {
    const app = express();
    app.use(express.json());
    app.post('/login', validateLogin, (req, res) => res.json({ ok: true }));

    const response = await request(app)
      .post('/login')
      .send({ email: sensitiveMarker, password: sensitiveMarker });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(JSON.stringify(response.body)).not.toContain(sensitiveMarker);
    expect(response.body.details[0]).toHaveProperty('path');
    expect(response.body.details[0]).toHaveProperty('msg');
    expect(response.body.details[0]).not.toHaveProperty('value');
  });

  test('request logging excludes query strings, authorization, and body data', async () => {
    const stream = { write: jest.fn() };
    const app = express();
    app.use(createRequestLogger(stream));
    app.use(express.json());
    app.post('/items', (req, res) => res.status(201).json({ ok: true }));

    const response = await request(app)
      .post('/items?token=query-secret')
      .set('Authorization', `Bearer ${sensitiveMarker}`)
      .send({ password: sensitiveMarker });

    const output = stream.write.mock.calls.map(([line]) => line).join('');
    expect(response.status).toBe(201);
    expect(output).toContain('POST /items 201');
    expect(output).not.toContain('?token=query-secret');
    expect(output).not.toContain(sensitiveMarker);
    expect(output).not.toContain('password');
  });

  test('personnel internal errors remain generic', async () => {
    const existingQuery = buildQuery({
      data: { id: '123e4567-e89b-12d3-a456-426614174014', organization_id: 'org-1', user_id: 'user-1' },
      error: null
    });
    const updateQuery = buildQuery({
      data: null,
      error: { message: sensitiveMarker, details: sensitiveMarker, hint: sensitiveMarker }
    });
    getClient.mockReturnValueOnce({
      from: jest.fn()
        .mockReturnValueOnce(existingQuery)
        .mockReturnValueOnce(updateQuery)
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'admin-1', role: 'admin', organization_id: 'org-1' };
      next();
    });
    app.use('/personnel', personnelRouter);

    const response = await request(app)
      .put('/personnel/123e4567-e89b-12d3-a456-426614174014')
      .send({ is_active: false });

    expect(response.status).toBe(500);
    expect(response.text).not.toContain(sensitiveMarker);
    expect(response.body).toEqual({ error: 'Failed to update personnel' });
  });

  test('team member internal errors remain generic', async () => {
    const teamQuery = buildQuery({ data: { id: '123e4567-e89b-12d3-a456-426614174015' }, error: null });
    const personnelQuery = buildQuery({ data: { id: 'person-1' }, error: null });
    const memberQuery = buildQuery({ data: null, error: { message: sensitiveMarker } });
    getClient.mockReturnValueOnce({
      from: jest.fn()
        .mockReturnValueOnce(teamQuery)
        .mockReturnValueOnce(personnelQuery)
        .mockReturnValueOnce(memberQuery)
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'admin-1', role: 'admin', organization_id: 'org-1' };
      next();
    });
    app.use('/teams', teamsRouter);

    const response = await request(app)
      .post('/teams/123e4567-e89b-12d3-a456-426614174015/members')
      .send({ userId: '123e4567-e89b-12d3-a456-426614174016' });

    expect(response.status).toBe(500);
    expect(response.text).not.toContain(sensitiveMarker);
    expect(response.body).toEqual({ error: 'Failed to add team member' });
  });
});
