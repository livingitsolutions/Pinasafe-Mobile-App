const NUMERIC_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const TIMESTAMP_STRING = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const parseNumber = (value) => {
  if (typeof value !== 'string' || !NUMERIC_STRING.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTimestamp = (value) => {
  if (typeof value !== 'string') return null;
  const match = TIMESTAMP_STRING.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = [31, ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (
    month < 1 || month > 12
    || day < 1 || day > daysInMonth[month - 1]
    || hour > 23 || minute > 59 || second > 59
  ) return null;

  if (zone !== 'Z') {
    const [, offsetSign, offsetHourText, offsetMinuteText] = /([+-])(\d{2}):(\d{2})$/.exec(zone);
    if (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59) return null;
    if (offsetSign === '-' && offsetHourText === '00' && offsetMinuteText === '00') return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

const validateCaptureLocation = (body = {}) => {
  const latitude = parseNumber(body.captureLatitude);
  const longitude = parseNumber(body.captureLongitude);
  const capturedAt = parseTimestamp(body.capturedAt);
  const accuracy = body.captureAccuracy == null ? null : parseNumber(body.captureAccuracy);

  if (
    latitude === null || latitude < -90 || latitude > 90
    || longitude === null || longitude < -180 || longitude > 180
    || capturedAt === null
    || (body.captureAccuracy != null && (accuracy === null || accuracy < 0))
  ) {
    return { valid: false, captureLocation: null };
  }

  return {
    valid: true,
    captureLocation: { latitude, longitude, accuracy, capturedAt }
  };
};

module.exports = { validateCaptureLocation };