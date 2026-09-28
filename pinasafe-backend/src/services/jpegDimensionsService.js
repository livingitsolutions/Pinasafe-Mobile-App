const MAX_JPEG_WIDTH = 8192;
const MAX_JPEG_HEIGHT = 8192;
const MAX_JPEG_PIXELS = 40_000_000;

const SUPPORTED_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2]);
const UNSUPPORTED_SOF_MARKERS = new Set([
  0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

const invalidJpeg = () => new TypeError('Invalid JPEG evidence');

const isStandaloneMarker = (marker) =>
  marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

const readFrameDimensions = (buffer, segmentStart, segmentLength, marker) => {
  if (segmentLength < 8) throw invalidJpeg();

  const payloadStart = segmentStart + 2;
  const precision = buffer[payloadStart];
  const height = buffer.readUInt16BE(payloadStart + 1);
  const width = buffer.readUInt16BE(payloadStart + 3);
  const componentCount = buffer[payloadStart + 5];
  const expectedLength = 8 + (3 * componentCount);

  if (
    componentCount < 1
    || (marker === 0xc0 && componentCount > 4)
    || segmentLength !== expectedLength
    || (marker === 0xc0 ? precision !== 8 : ![8, 12].includes(precision))
  ) {
    throw invalidJpeg();
  }

  const componentIds = new Set();
  for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
    const componentOffset = payloadStart + 6 + (componentIndex * 3);
    const componentId = buffer[componentOffset];
    const samplingFactors = buffer[componentOffset + 1];
    const horizontalSampling = samplingFactors >> 4;
    const verticalSampling = samplingFactors & 0x0f;
    const quantizationTable = buffer[componentOffset + 2];

    if (
      componentIds.has(componentId)
      || horizontalSampling < 1
      || horizontalSampling > 4
      || verticalSampling < 1
      || verticalSampling > 4
      || quantizationTable > 3
    ) {
      throw invalidJpeg();
    }
    componentIds.add(componentId);
  }

  if (
    width <= 0
    || height <= 0
    || width > MAX_JPEG_WIDTH
    || height > MAX_JPEG_HEIGHT
    || (BigInt(width) * BigInt(height)) > BigInt(MAX_JPEG_PIXELS)
  ) {
    throw invalidJpeg();
  }

  return { width, height };
};

const getJpegDimensions = (buffer) => {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('JPEG input must be a Buffer');
  if (
    buffer.length < 4
    || buffer[0] !== 0xff
    || buffer[1] !== 0xd8
    || buffer[buffer.length - 2] !== 0xff
    || buffer[buffer.length - 1] !== 0xd9
  ) {
    throw invalidJpeg();
  }

  let offset = 2;
  while (offset < buffer.length - 2) {
    if (buffer[offset] !== 0xff) throw invalidJpeg();

    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) throw invalidJpeg();

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || marker === 0xda) {
      throw invalidJpeg();
    }

    if (isStandaloneMarker(marker)) continue;

    if (offset + 2 > buffer.length) throw invalidJpeg();
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2) throw invalidJpeg();

    const segmentEnd = offset + segmentLength;
    if (segmentEnd > buffer.length) throw invalidJpeg();

    if (SUPPORTED_SOF_MARKERS.has(marker)) {
      return readFrameDimensions(buffer, offset, segmentLength, marker);
    }

    if (UNSUPPORTED_SOF_MARKERS.has(marker)) throw invalidJpeg();

    offset = segmentEnd;
  }

  throw invalidJpeg();
};

module.exports = {
  MAX_JPEG_WIDTH,
  MAX_JPEG_HEIGHT,
  MAX_JPEG_PIXELS,
  getJpegDimensions
};