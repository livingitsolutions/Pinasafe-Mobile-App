jest.mock('../config/database', () => ({
  getAIEndpointUrl: jest.fn(() => 'https://classifier.example/predict')
}));

const { getAIEndpointUrl } = require('../config/database');
const {
  CLASSIFIER_TIMEOUT_MS,
  MAX_CLASSIFICATION_TEXT_LENGTH,
  MAX_CLASSIFIER_RESPONSE_BYTES,
  classifyEvidenceImage,
  normalizeClassifierResponse
} = require('../services/aiClassificationService');

const validJpeg = () => Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
const validProviderResult = (overrides = {}) => ({
  label: 'fire',
  confidence: 0.9,
  status: 'valid',
  action: 'accept',
  reason: '  Fire   confirmed  ',
  caption: ' Smoke   visible ',
  ...overrides
});

const expectInvalidProviderResponse = (callback) => {
  try {
    callback();
    throw new Error('Expected invalid provider response');
  } catch (error) {
    expect(error.code).toBe('AI_CLASSIFIER_INVALID_RESPONSE');
  }
};

describe('server-side AI classification service', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
    jest.clearAllMocks();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('posts JPEG bytes as multipart field file with a server filename and redirect rejection', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(validProviderResult()), { status: 200 }));
    const imageBuffer = validJpeg();

    await classifyEvidenceImage(imageBuffer);

    expect(getAIEndpointUrl).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://classifier.example/predict');
    expect(options.method).toBe('POST');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file')).toBeInstanceOf(Blob);
    expect(options.body.get('file').type).toBe('image/jpeg');
    expect(options.body.get('file').size).toBe(imageBuffer.length);
    expect(options.body.get('file').name).toBe('evidence.jpg');
    expect(options.body.has('classification')).toBe(false);
    expect(options.body.has('label')).toBe(false);
    expect(options.headers).toBeUndefined();
    expect(CLASSIFIER_TIMEOUT_MS).toBe(30_000);
  });

  test('clears the timeout after classification completes', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(validProviderResult()), { status: 200 }));

    await classifyEvidenceImage(validJpeg());

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  test('normalizes fire and road aliases while preserving confidence boundaries', () => {
    expect(normalizeClassifierResponse(validProviderResult({ label: 'FIRE', confidence: 0 }))).toMatchObject({
      accepted: true, label: 'fire', confidence: 0
    });
    expect(normalizeClassifierResponse(validProviderResult({ label: 'road', confidence: 1 }))).toMatchObject({
      accepted: true, label: 'road', confidence: 1
    });
    for (const label of ['accident', 'collision', 'vehicle_accident', 'car_crash', 'road_accident']) {
      expect(normalizeClassifierResponse(validProviderResult({ label })).label).toBe('road');
    }
    expect(normalizeClassifierResponse(validProviderResult({ label: 'medical' }))).toMatchObject({
      accepted: false, label: 'other'
    });
  });

  test('acceptance requires fire or road, valid status, and accept action only', () => {
    const accepted = [
      validProviderResult({ label: 'fire' }),
      validProviderResult({ label: 'road' })
    ];
    accepted.forEach((result) => expect(normalizeClassifierResponse(result).accepted).toBe(true));

    const rejected = [
      validProviderResult({ label: 'other' }),
      validProviderResult({ label: 'fire', status: 'invalid' }),
      validProviderResult({ label: 'fire', action: 'reject' }),
      validProviderResult({ label: 'fire', action: 'uncertain' })
    ];
    rejected.forEach((result) => expect(normalizeClassifierResponse(result).accepted).toBe(false));
  });

  test.each([
    ['missing', (response) => delete response.label],
    ['null', (response) => { response.label = null; }],
    ['empty', (response) => { response.label = ''; }],
    ['whitespace-only', (response) => { response.label = '  \t '; }],
    ['non-string', (response) => { response.label = 42; }]
  ])('rejects %s label fields', (_, mutate) => {
    const response = validProviderResult();
    mutate(response);
    expectInvalidProviderResponse(() => normalizeClassifierResponse(response));
  });

  test.each([
    ['missing', (response) => delete response.status],
    ['null', (response) => { response.status = null; }],
    ['empty', (response) => { response.status = ''; }],
    ['unknown', (response) => { response.status = 'uncertain'; }],
    ['non-string', (response) => { response.status = true; }]
  ])('rejects %s status fields', (_, mutate) => {
    const response = validProviderResult();
    mutate(response);
    expectInvalidProviderResponse(() => normalizeClassifierResponse(response));
  });

  test.each([
    ['missing', (response) => delete response.action],
    ['null', (response) => { response.action = null; }],
    ['empty', (response) => { response.action = ''; }],
    ['unknown', (response) => { response.action = 'approve'; }],
    ['non-string', (response) => { response.action = 1; }]
  ])('rejects %s action fields', (_, mutate) => {
    const response = validProviderResult();
    mutate(response);
    expectInvalidProviderResponse(() => normalizeClassifierResponse(response));
  });

  test('missing confidence is null and low confidence alone does not reject', () => {
    const missingConfidence = validProviderResult();
    delete missingConfidence.confidence;
    expect(normalizeClassifierResponse(missingConfidence)).toMatchObject({
      accepted: true, confidence: null
    });
    expect(normalizeClassifierResponse(validProviderResult({ confidence: 0.1 }))).toMatchObject({
      accepted: true, confidence: 0.1
    });
  });

  test.each([NaN, Infinity, -0.01, 1.01, '0.9', null])('rejects malformed confidence %s', (confidence) => {
    expect(() => normalizeClassifierResponse(validProviderResult({ confidence }))).toThrow();
  });

  test('normalizes and bounds optional reason and caption text', () => {
    const result = normalizeClassifierResponse(validProviderResult({
      reason: `  ${'why '.repeat(MAX_CLASSIFICATION_TEXT_LENGTH)} `,
      caption: '  smoke\n\t visible  '
    }));

    expect(result.reason).toHaveLength(MAX_CLASSIFICATION_TEXT_LENGTH);
    expect(result.caption).toBe('smoke visible');
    expect(normalizeClassifierResponse(validProviderResult({ reason: '', caption: '  ' }))).toMatchObject({
      reason: null, caption: null
    });
    expect(() => normalizeClassifierResponse(validProviderResult({ reason: { text: 'unsafe' } }))).toThrow();
    expect(() => normalizeClassifierResponse(validProviderResult({ caption: ['unsafe'] }))).toThrow();
  });

  test.each([
    ['array', []],
    ['null', null],
    ['string', 'not an object']
  ])('rejects non-object provider JSON: %s', (_, payload) => {
    expect(() => normalizeClassifierResponse(payload)).toThrow();
  });

  test('fails closed for provider HTTP errors without exposing provider details', async () => {
    fetchSpy.mockResolvedValue(new Response('provider body secret', { status: 422 }));

    await expect(classifyEvidenceImage(validJpeg())).rejects.toMatchObject({
      code: 'AI_CLASSIFIER_FAILED',
      message: 'Classification service unavailable'
    });
  });

  test('fails closed for malformed JSON and oversized response bodies', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{bad json', { status: 200 }));
    await expect(classifyEvidenceImage(validJpeg())).rejects.toMatchObject({ code: 'AI_CLASSIFIER_INVALID_RESPONSE' });

    fetchSpy.mockResolvedValueOnce(new Response('x'.repeat(MAX_CLASSIFIER_RESPONSE_BYTES + 1), { status: 200 }));
    await expect(classifyEvidenceImage(validJpeg())).rejects.toMatchObject({ code: 'AI_CLASSIFIER_INVALID_RESPONSE' });
  });

  test.each([
    ['missing status', (response) => delete response.status],
    ['unknown status', (response) => { response.status = 'pending'; }],
    ['missing action', (response) => delete response.action],
    ['unknown action', (response) => { response.action = 'approve'; }]
  ])('classifies 2xx response with %s as invalid provider contract', async (_, mutate) => {
    const response = validProviderResult();
    mutate(response);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

    await expect(classifyEvidenceImage(validJpeg())).rejects.toMatchObject({
      code: 'AI_CLASSIFIER_INVALID_RESPONSE'
    });
  });

  test.each(['[]', 'null', '"text"'])('fails closed for non-object JSON %s', async (body) => {
    fetchSpy.mockResolvedValue(new Response(body, { status: 200 }));

    await expect(classifyEvidenceImage(validJpeg())).rejects.toMatchObject({
      code: 'AI_CLASSIFIER_INVALID_RESPONSE'
    });
  });

  test.each([
    ['timeout', Object.assign(new Error('timeout secret'), { name: 'TimeoutError' }), 'AI_CLASSIFIER_TIMEOUT'],
    ['network failure', new Error('network provider detail'), 'AI_CLASSIFIER_FAILED']
  ])('fails closed on %s without retry', async (_, error, expectedCode) => {
    fetchSpy.mockRejectedValue(error);

    await expect(classifyEvidenceImage(validJpeg())).rejects.toMatchObject({ code: expectedCode });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('rejects invalid input buffers without making a request', async () => {
    await expect(classifyEvidenceImage('base64')).rejects.toThrow(/Buffer/);
    await expect(classifyEvidenceImage(Buffer.from('not jpeg'))).rejects.toThrow(/JPEG/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});