const jwt = require('jsonwebtoken');
const { getClient } = require('../config/database');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const supabase = getClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, phone, address, verified, organization_id')
      .eq('id', decoded.userId)
      .maybeSingle();

    if (!user) {
      return res.status(401).json({ error: 'Invalid token - user not found' });
    }

   
    if (user.role === 'responder') {
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (teamMember) {
        user.team_id = teamMember.team_id;
      }
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired' });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRoles = Array.isArray(roles) ? roles : [roles];
    if (!userRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: userRoles,
        current: req.user.role
      });
    }

    next();
  };
};

const canAccessOrganization = (user, organizationId) => {
  if (!user || !organizationId) {
    return false;
  }

  if (user.role !== 'admin' && user.role !== 'responder') {
    return false;
  }

  return user.organization_id === organizationId;
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const supabase = getClient();

      const { data: user } = await supabase
        .from('users')
        .select('id, email, name, role, phone, address, verified, organization_id')
        .eq('id', decoded.userId)
        .maybeSingle();

      req.user = user;
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  optionalAuth,
  canAccessOrganization
};
