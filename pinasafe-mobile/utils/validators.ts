export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export const validators = {
  email: (email: string): ValidationResult => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      return { isValid: false, error: 'Email is required' };
    }
    if (!emailRegex.test(email)) {
      return { isValid: false, error: 'Invalid email format' };
    }
    return { isValid: true };
  },

  phone: (phone: string): ValidationResult => {
    const phoneRegex = /^(\+63|0)?[0-9]{10}$/;
    if (!phone) {
      return { isValid: false, error: 'Phone number is required' };
    }
    const cleanPhone = phone.replace(/[\s\-()]/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      return { isValid: false, error: 'Invalid Philippine phone number' };
    }
    return { isValid: true };
  },

  password: (password: string): ValidationResult => {
    if (!password) {
      return { isValid: false, error: 'Password is required' };
    }
    if (password.length < 8) {
      return { isValid: false, error: 'Password must be at least 8 characters' };
    }
    if (!/[A-Z]/.test(password)) {
      return { isValid: false, error: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
      return { isValid: false, error: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { isValid: false, error: 'Password must contain at least one number' };
    }
    return { isValid: true };
  },

  required: (value: string, fieldName: string): ValidationResult => {
    if (!value || value.trim() === '') {
      return { isValid: false, error: `${fieldName} is required` };
    }
    return { isValid: true };
  },

  minLength: (value: string, min: number, fieldName: string): ValidationResult => {
    if (value.length < min) {
      return { isValid: false, error: `${fieldName} must be at least ${min} characters` };
    }
    return { isValid: true };
  },

  maxLength: (value: string, max: number, fieldName: string): ValidationResult => {
    if (value.length > max) {
      return { isValid: false, error: `${fieldName} must not exceed ${max} characters` };
    }
    return { isValid: true };
  },

  uuid: (value: string): ValidationResult => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      return { isValid: false, error: 'Invalid ID format' };
    }
    return { isValid: true };
  },
};

export const sanitize = {
  html: (value: string): string => {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },

  sql: (value: string): string => {
    return value.replace(/['";]/g, '');
  },

  trim: (value: string): string => {
    return value.trim();
  },

  phone: (value: string): string => {
    return value.replace(/[^0-9+]/g, '');
  },
};
