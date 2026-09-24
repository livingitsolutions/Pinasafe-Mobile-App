const { body, param, query, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Auth validation rules
const validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('phone')
    .optional()
    .matches(/^(\+63|0)?[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}$/)
    .withMessage('Valid phone number required'),
  body('address')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Address too long'),
  handleValidationErrors
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

const validatePersonnelInvitationAcceptance = [
  body('token')
    .isString()
    .matches(/^[A-Za-z0-9_-]{43}$/)
    .withMessage('Valid invitation token is required'),
  body('password')
    .isString()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  handleValidationErrors
];

// Emergency report validation
const validateEmergencyReport = [
  body('type')
    .isIn(['road', 'fire'])
    .withMessage('Invalid emergency type'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('location')
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Location must be between 5 and 500 characters'),
  body('priority')
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority level'),
  body('coordinates.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('coordinates.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  body('contactNumber')
    .optional()
    .matches(/^(\+63|0)?[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}$/)
    .withMessage('Invalid contact number'),
  handleValidationErrors
];

// Alert validation
const validateAlert = [
  body('type')
    .isIn(['weather', 'emergency', 'community', 'system'])
    .withMessage('Invalid alert type'),
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .trim()
    .isLength({ min: 5, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('priority')
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority level'),
  body('location')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Location must be between 2 and 200 characters'),
  handleValidationErrors
];


// Personnel invitation validation
const validatePersonnelInvitation = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('contactNumber')
    .trim()
    .matches(/^(\+63|0)?[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}$/)
    .withMessage('Valid contact number required'),
  body('personnelRole')
    .isIn(['staff', 'rescue_member'])
    .withMessage('Personnel role must be staff or rescue_member'),
  body('specializations')
    .optional()
    .isArray({ max: 20 })
    .withMessage('Specializations must be an array'),
  body('specializations.*')
    .optional()
    .isString()
    .withMessage('Each specialization must be a string')
    .bail()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each specialization must be between 1 and 100 characters'),
  body('userRole')
    .not()
    .exists()
    .withMessage('userRole is not accepted'),
  body('organizationId')
    .not()
    .exists()
    .withMessage('organizationId is not accepted'),
  body('organization_id')
    .not()
    .exists()
    .withMessage('organization_id is not accepted'),
  body('password')
    .not()
    .exists()
    .withMessage('password is not accepted'),
  handleValidationErrors
];

// Parameter validation
const validateUUID = (paramName) => [
  param(paramName)
    .isUUID()
    .withMessage(`Invalid ${paramName} format`),
  handleValidationErrors
];

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validatePersonnelInvitationAcceptance,
  validateEmergencyReport,
  validateAlert,
  validatePersonnelInvitation,
  validateUUID,
  validatePagination,
  handleValidationErrors
};