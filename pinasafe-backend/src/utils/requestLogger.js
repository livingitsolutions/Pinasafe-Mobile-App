const morgan = require('morgan');

const createRequestLogger = (stream) => {
  morgan.token('pathname', (req) => req.path);
  return morgan(
    ':remote-addr :method :pathname :status :res[content-length] :response-time ms :user-agent',
    stream ? { stream } : undefined
  );
};

module.exports = { createRequestLogger };
