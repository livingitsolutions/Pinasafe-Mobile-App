const { body, param, query, validationResult } = require('express-validator');
const { validate: isValidUuid } = require('uuid');

const phonePattern = /^(\+63|0)?[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}$/;

const optionalStrictBoolean = (field) => body(field)
  .optional()
  .custom((value) => typeof value === 'boolean')
  .withMessage(`${field} must be a boolean`);

const optionalBoundedString = (field, max, min = 0) => body(field)
  .optional()
  .isString()
  .withMessage(`${field} must be a string`)
  .bail()
  .trim()
  .isLength({ min, max })
  .withMessage(`${field} must be between ${min} and ${max} characters`);

const matchingAliases = (primary, alias, label) => body(primary)
  .optional()
  .custom((value, { req }) => {
    if (Object.prototype.hasOwnProperty.call(req.body, alias) && value !== req.body[alias]) {
      throw new Error(`${label} aliases must match`);
    }
    return true;
  });

const DURABLE_EVIDENCE_IDENTITY_KEYS = new Set([
  'bucket',
  'bucketname',
  'storagebucket',
  'storagebucketname',
  'storagepath',
  'storagekey',
  'storageobjectkey',
  'objectkey',
  'filekey',
  'evidenceid',
  'evidencerowid',
  'reportevidenceid',
  'signedurl',
  'signeduri'
]);

const containsDurableEvidenceMetadata = (value) => {
  if (!value || typeof value !== 'object') return false;

  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return DURABLE_EVIDENCE_IDENTITY_KEYS.has(normalizedKey)
      || containsDurableEvidenceMetadata(child);
  });
};

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(({ type, msg, path, location, param }) => ({
        type,
        msg,
        path: path || param,
        location
      }))
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
    .withMessage('Invalid latitude')
    .toFloat(),
  body('coordinates.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude')
    .toFloat(),
  body('contactNumber')
    .optional()
    .matches(/^(\+63|0)?[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}$/)
    .withMessage('Invalid contact number'),
  body('uploadSessionId')
    .optional({ values: 'null' })
    .custom((value) => value === '' || (typeof value === 'string' && isValidUuid(value)))
    .withMessage('Upload session ID must be a valid UUID')
    .bail()
    .custom((value, { req }) => {
      if (
        value
        && (
          containsDurableEvidenceMetadata(req.body.evidence)
          || containsDurableEvidenceMetadata(req.body.aiClassification)
        )
      ) {
        throw new Error('Durable evidence metadata must be created by the server');
      }
      return true;
    }),
  handleValidationErrors
];

const validateEmergencyStatusUpdate = [
  body('status')
    .isIn(['pending', 'dispatched', 'responding', 'resolved'])
    .withMessage('Invalid status'),
  body('notes')
    .optional()
    .isString()
    .withMessage('Notes must be a string')
    .bail()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Notes must not exceed 2000 characters'),
  handleValidationErrors
];

const validateTeamAssignment = [
  body('teamId')
    .isUUID()
    .withMessage('Team ID must be a valid UUID'),
  handleValidationErrors
];

const validateLocationTracking = [
  body('latitude')
    .exists({ checkNull: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90')
    .toFloat(),
  body('longitude')
    .exists({ checkNull: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
    .toFloat(),
  body('accuracy')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Accuracy must be a non-negative number')
    .toFloat(),
  body('speed')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Speed must be a non-negative number')
    .toFloat(),
  body('heading')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Heading must be between 0 and 359.999...')
    .bail()
    .custom((value) => Number(value) < 360)
    .withMessage('Heading must be less than 360')
    .toFloat(),
  body('eta_minutes')
    .optional()
    .isInt({ min: 0 })
    .withMessage('ETA must be a non-negative integer')
    .toInt(),
  handleValidationErrors
];

const validateProfileUpdate = [
  optionalBoundedString('name', 100, 2),
  body('phone')
    .optional()
    .matches(phonePattern)
    .withMessage('Valid phone number required'),
  optionalBoundedString('address', 500),
  handleValidationErrors
];

const validatePersonnelCreate = [
  body('userId').isUUID().withMessage('User ID must be a valid UUID'),
  body('name').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('contactNumber').matches(phonePattern).withMessage('Valid contact number required'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('personnelRole').isIn(['staff', 'rescue_member']).withMessage('Invalid personnel role'),
  body('specializations').optional().isArray({ max: 20 }).withMessage('Specializations must be an array'),
  body('specializations.*').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Specialization must be between 1 and 100 characters'),
  handleValidationErrors
];

const validatePersonnelUpdate = [
  body('contactNumber').optional().matches(phonePattern).withMessage('Valid contact number required'),
  body('contact_number').optional().matches(phonePattern).withMessage('Valid contact number required'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
  optionalBoundedString('address', 500),
  optionalBoundedString('barangay', 100),
  optionalBoundedString('city', 100),
  optionalBoundedString('province', 100),
  body('specializations').optional().isArray({ max: 20 }).withMessage('Specializations must be an array'),
  body('specializations.*').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Specialization must be between 1 and 100 characters'),
  matchingAliases('personnelRole', 'personnel_role', 'Personnel role'),
  body('personnelRole').optional().isIn(['staff', 'rescue_member']).withMessage('Invalid personnel role'),
  body('personnel_role').optional().isIn(['staff', 'rescue_member']).withMessage('Invalid personnel role'),
  matchingAliases('isActive', 'is_active', 'Active state'),
  optionalStrictBoolean('isActive'),
  optionalStrictBoolean('is_active'),
  optionalBoundedString('team', 100),
  handleValidationErrors
];

const validateTeamCreate = [
  body('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Team name must be between 1 and 100 characters'),
  body('teamLeaderId').optional({ nullable: true }).isUUID().withMessage('Team leader ID must be a valid UUID'),
  optionalBoundedString('description', 500),
  handleValidationErrors
];

const validateTeamUpdate = [
  optionalBoundedString('name', 100, 1),
  body('teamLeaderId').optional({ nullable: true }).isUUID().withMessage('Team leader ID must be a valid UUID'),
  optionalBoundedString('description', 500),
  optionalStrictBoolean('isActive'),
  handleValidationErrors
];

const validateTeamMember = [
  body('userId').isUUID().withMessage('User ID must be a valid UUID'),
  optionalBoundedString('position', 100),
  handleValidationErrors
];

const validateClusterUpdate = [
  body('message')
    .isString()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),
  body('status')
    .isIn(['pending', 'dispatched', 'responding', 'resolved'])
    .withMessage('Invalid status'),
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
  validateEmergencyStatusUpdate,
  validateTeamAssignment,
  validateLocationTracking,
  validateProfileUpdate,
  validatePersonnelCreate,
  validatePersonnelUpdate,
  validateTeamCreate,
  validateTeamUpdate,
  validateTeamMember,
  validateClusterUpdate,
  validateAlert,
  validatePersonnelInvitation,
  validateUUID,
  validatePagination,
  handleValidationErrors
};