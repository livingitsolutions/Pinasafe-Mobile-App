const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.status || 500
  };

  // MySQL errors
  if (err.code) {
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        error.message = 'Duplicate entry - resource already exists';
        error.status = 409;
        break;
      case 'ER_NO_REFERENCED_ROW_2':
        error.message = 'Referenced resource not found';
        error.status = 400;
        break;
      case 'ER_ROW_IS_REFERENCED_2':
        error.message = 'Cannot delete - resource is referenced by other records';
        error.status = 400;
        break;
      case 'ECONNREFUSED':
        error.message = 'Database connection failed';
        error.status = 503;
        break;
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.status = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.status = 401;
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error.message = 'Validation failed';
    error.status = 400;
    error.details = err.details;
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && error.status === 500) {
    error.message = 'Internal Server Error';
  }

  res.status(error.status).json({
    error: error.message,
    ...(error.details && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { errorHandler };