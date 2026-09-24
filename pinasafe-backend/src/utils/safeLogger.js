const write = (level, operation, status) => {
  const safeOperation = typeof operation === 'string' ? operation : 'unknown_operation';
  const safeStatus = Number.isInteger(status) ? ` status=${status}` : '';
  console[level](`[${safeOperation}]${safeStatus}`);
};

const safeLogger = {
  error(operation, status) {
    write('error', operation, status);
  },
  warn(operation, status) {
    write('warn', operation, status);
  },
  info(operation, status) {
    write('log', operation, status);
  }
};

module.exports = safeLogger;
