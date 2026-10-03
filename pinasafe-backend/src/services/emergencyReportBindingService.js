const { v4: uuidv4, validate: validateUUID } = require('uuid');
const { getClient } = require('../config/database');

const RPC_ERROR_CODES = new Map([
  ['BINDING_INVALID_REPORT', 'INVALID_REPORT'],
  ['BINDING_SESSION_UNAVAILABLE', 'SESSION_UNAVAILABLE'],
  ['BINDING_SESSION_EXPIRED', 'SESSION_EXPIRED'],
  ['BINDING_SESSION_ALREADY_BOUND', 'SESSION_ALREADY_BOUND'],
  ['BINDING_UPLOAD_IN_PROGRESS', 'UPLOAD_IN_PROGRESS'],
  ['BINDING_EXPIRED_EVIDENCE_PRESENT', 'EXPIRED_EVIDENCE_PRESENT'],
  ['BINDING_EVIDENCE_OWNER_MISMATCH', 'EVIDENCE_OWNER_MISMATCH'],
  ['BINDING_EVIDENCE_ALREADY_BOUND', 'EVIDENCE_ALREADY_BOUND'],
  ['BINDING_NO_ACCEPTED_EVIDENCE', 'NO_ACCEPTED_EVIDENCE'],
  ['BINDING_EVIDENCE_CAPACITY_INVALID', 'EVIDENCE_CAPACITY_INVALID'],
  ['BINDING_INVALID_CLASSIFICATION', 'INVALID_CLASSIFICATION'],
  ['BINDING_CLASSIFICATION_MISMATCH', 'CLASSIFICATION_MISMATCH'],
  ['BINDING_PRIMARY_EVIDENCE_INVALID', 'PRIMARY_EVIDENCE_INVALID'],
  ['BINDING_SUPPLEMENTARY_EVIDENCE_INVALID', 'SUPPLEMENTARY_EVIDENCE_INVALID'],
  ['BINDING_REPORT_ID_CONFLICT', 'REPORT_ID_CONFLICT']
]);

class EmergencyReportBindingError extends Error {
  constructor(code, reportId) {
    super('Emergency report creation failed');
    this.name = 'EmergencyReportBindingError';
    this.code = code;
    this.reportId = reportId;
  }
}

/** authenticatedReporterId must come from backend authentication, never request data. */
const createEmergencyReportWithEvidence = async (
  report,
  authenticatedReporterId,
  reportId = uuidv4()
) => {
  if (!validateUUID(reportId)) {
    throw new EmergencyReportBindingError('INVALID_REPORT_ID', reportId);
  }
  if (!validateUUID(authenticatedReporterId)) {
    throw new EmergencyReportBindingError('INVALID_REPORTER_ID', reportId);
  }

  const parameters = {
    p_report_id: reportId,
    p_reporter_id: authenticatedReporterId,
    p_type: report.type,
    p_description: typeof report.description === 'string' ? report.description.trim() : report.description,
    p_location: typeof report.location === 'string' ? report.location.trim() : report.location,
    p_latitude: report.coordinates?.latitude ?? null,
    p_longitude: report.coordinates?.longitude ?? null,
    p_contact_number: report.contactNumber || null,
    p_priority: report.priority,
    p_upload_session_id: report.uploadSessionId ?? null,
    p_evidence_photos: report.evidencePhotos || [],
    p_ai_classification: report.aiClassification || null,
    p_use_ai_classification: report.useAIClassification || false
  };

  try {
    const { data, error } = await getClient().rpc(
      'create_emergency_report_with_evidence',
      parameters
    );

    if (error) {
      const code = RPC_ERROR_CODES.get(error.message) || 'REPORT_CREATE_FAILED';
      throw new EmergencyReportBindingError(code, reportId);
    }

    if (
      !data
      || !['CREATED', 'REPLAYED'].includes(data.outcome)
      || data.report_id !== reportId
    ) {
      throw new EmergencyReportBindingError('REPORT_CREATE_FAILED', reportId);
    }

    return { reportId, outcome: data.outcome };
  } catch (error) {
    if (error instanceof EmergencyReportBindingError) throw error;
    throw new EmergencyReportBindingError('REPORT_CREATE_FAILED', reportId);
  }
};

module.exports = {
  EmergencyReportBindingError,
  createEmergencyReportWithEvidence
};