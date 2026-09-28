const safeLogger = require('../utils/safeLogger');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let status = Number.isInteger(err.status) ? err.status : 500;
  let message = 'Internal Server Error';
  let details;

  if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Token expired';
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
    details = Array.isArray(err.details)
      ? err.details.map(({ type, msg, path, location, param }) => ({
        type,
        msg,
        path: path || param,
        location
      }))
      : undefined;
  } else if (status === 400) {
    message = 'Bad Request';
  } else if (status === 401) {
    message = 'Unauthorized';
  } else if (status === 403) {
    message = 'Forbidden';
  } else if (status === 404) {
    message = 'Not Found';
  } else if (status === 409) {
    message = 'Conflict';
  } else if (status === 410) {
    message = 'Gone';
  } else if (status === 429) {
    message = 'Too Many Requests';
  } else if (status === 503) {
    message = 'Service Unavailable';
  } else {
    status = 500;
  }

  safeLogger.error('http.unhandled_error', status);

  res.status(status).json({
    error: message,
    ...(details && { details })
  });
};

module.exports = { errorHandler };