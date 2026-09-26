const {
  MAX_JPEG_WIDTH,
  MAX_JPEG_HEIGHT,
  MAX_JPEG_PIXELS,
  getJpegDimensions
} = require('../services/jpegDimensionsService');

const segment = (marker, payload = Buffer.alloc(0)) => {
  const length = payload.length + 2;
  return Buffer.concat([
    Buffer.from([0xff, marker, (length >> 8) & 0xff, length & 0xff]),
    payload
  ]);
};

const sofSegment = ({ marker = 0xc0, width = 500, height = 500, precision = 8, componentCount = 3 } = {}) => {
  const components = [];
  for (let index = 0; index < componentCount; index += 1) {
    components.push(index + 1, 0x11, Math.min(index, 3));
  }
  const payload = Buffer.from([
    precision,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    componentCount,
    ...components
  ]);
  return segment(marker, payload);
};

const jpeg = (...headerSegments) => Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  ...headerSegments,
  segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
  Buffer.from([0x11, 0x22, 0xff, 0xd9])
]);

describe('JPEG structural dimension parser', () => {
  test.each([
    ['SOF0 baseline', 0xc0],
    ['SOF1 extended sequential', 0xc1],
    ['SOF2 progressive', 0xc2]
  ])('extracts dimensions from %s', (_, marker) => {
    expect(getJpegDimensions(jpeg(sofSegment({ marker, width: 640, height: 480 })))).toEqual({
      width: 640,
      height: 480
    });
  });

  test('accepts current 500x500 evidence dimensions', () => {
    expect(getJpegDimensions(jpeg(sofSegment()))).toEqual({ width: 500, height: 500 });
  });

  test('accepts bounded multi-component SOF1/SOF2 headers', () => {
    expect(getJpegDimensions(jpeg(sofSegment({ marker: 0xc1, componentCount: 5 })))).toEqual({
      width: 500,
      height: 500
    });
    expect(getJpegDimensions(jpeg(sofSegment({ marker: 0xc2, componentCount: 5 })))).toEqual({
      width: 500,
      height: 500
    });
    expect(() => getJpegDimensions(jpeg(sofSegment({ marker: 0xc0, componentCount: 5 }))))
      .toThrow('Invalid JPEG evidence');
  });

  test('handles repeated marker fill bytes and standalone TEM marker', () => {
    const fill = Buffer.from([0xff, 0xff, 0x01]);
    const filledSof = Buffer.from([0xff, 0xff, 0xc0]);
    const normalSof = sofSegment();
    const filledSegment = Buffer.concat([filledSof, normalSof.subarray(2)]);

    expect(getJpegDimensions(jpeg(fill, filledSegment))).toEqual({ width: 500, height: 500 });
  });

  test.each([0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7])(
    'handles standalone restart marker FF %s before SOF without reading a length',
    (marker) => {
      expect(getJpegDimensions(jpeg(Buffer.from([0xff, marker]), sofSegment()))).toEqual({
        width: 500,
        height: 500
      });
    }
  );

  test.each([
    ['APP', 0xe1, 0xc0],
    ['COM', 0xfe, 0xc2]
  ])('skips fake SOF bytes embedded in %s payload', (_, marker, fakeSofMarker) => {
    const fakePayload = Buffer.concat([
      Buffer.from([0xff, fakeSofMarker]),
      sofSegment({ marker: fakeSofMarker, width: 1, height: 1 }).subarray(2)
    ]);

    expect(getJpegDimensions(jpeg(segment(marker, fakePayload), sofSegment({ width: 640, height: 480 })))).toEqual({
      width: 640,
      height: 480
    });
  });

  test.each([0xc4, 0xc8, 0xcc])('does not treat marker FF %s as SOF', (marker) => {
    expect(getJpegDimensions(jpeg(segment(marker), sofSegment({ width: 320, height: 240 })))).toEqual({
      width: 320,
      height: 240
    });
  });

  test.each([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])(
    'rejects unsupported SOF marker FF %s',
    (marker) => {
      expect(() => getJpegDimensions(jpeg(sofSegment({ marker })))).toThrow('Invalid JPEG evidence');
    }
  );

  test.each([
    ['segment length zero', Buffer.from([0xff, 0xdb, 0x00, 0x00])],
    ['segment length below two', Buffer.from([0xff, 0xdb, 0x00, 0x01])],
    ['segment overrun', Buffer.from([0xff, 0xe1, 0x00, 0x20, 0x01])]
  ])('rejects %s', (_, malformed) => {
    expect(() => getJpegDimensions(jpeg(malformed))).toThrow('Invalid JPEG evidence');
  });

  test('rejects a truncated marker prefix', () => {
    expect(() => getJpegDimensions(Buffer.from([0xff, 0xd8, 0xff]))).toThrow('Invalid JPEG evidence');
  });

  test.each([
    ['missing SOF', jpeg(segment(0xe1, Buffer.from([1, 2, 3])))],
    ['SOS before SOF', jpeg(segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])))],
    ['EOI before SOF', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    ['truncated SOF header', jpeg(segment(0xc0, Buffer.from([8, 0, 1])))],
    ['SOF component count zero', jpeg(sofSegment({ componentCount: 0 }))],
    ['invalid component count/header length', jpeg(segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 3, 1])))]
  ])('rejects %s', (_, input) => {
    expect(() => getJpegDimensions(input)).toThrow('Invalid JPEG evidence');
  });

  test('rejects a SOF segment truncated while the marker walker expects its declared payload', () => {
    const truncatedSof = Buffer.from([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11,
      0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00,
      0xff, 0xd9
    ]);

    expect(truncatedSof.length).toBeGreaterThanOrEqual(4);
    expect(truncatedSof.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(truncatedSof.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(() => getJpegDimensions(truncatedSof)).toThrow('Invalid JPEG evidence');
  });

  test.each([
    ['zero width', { width: 0, height: 100 }],
    ['zero height', { width: 100, height: 0 }],
    ['width above maximum', { width: MAX_JPEG_WIDTH + 1, height: 100 }],
    ['height above maximum', { width: 100, height: MAX_JPEG_HEIGHT + 1 }],
    ['pixel count above maximum', { width: 7000, height: 6000 }]
  ])('rejects %s', (_, dimensions) => {
    expect(() => getJpegDimensions(jpeg(sofSegment(dimensions)))).toThrow('Invalid JPEG evidence');
  });

  test('rejects non-Buffer and random/non-JPEG inputs', () => {
    expect(() => getJpegDimensions('jpeg')).toThrow('JPEG input must be a Buffer');
    expect(() => getJpegDimensions(Buffer.from('not a jpeg'))).toThrow('Invalid JPEG evidence');
  });
});