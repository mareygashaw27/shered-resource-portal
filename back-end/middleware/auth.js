const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'shered_res_secret_key_2026';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token || token.startsWith('simulated_')) {
    // If no token provided or simulated token, allow simulated role header for testing
    const simulatedRoleId = req.headers['x-simulated-user-id'];
    const simulatedRole = req.headers['x-simulated-role'];
    if (simulatedRole) {
      req.user = {
        id: parseInt(simulatedRoleId || '4'),
        role: simulatedRole,
        department: req.headers['x-simulated-dept'] || 'IT Department',
        name: req.headers['x-simulated-name'] || 'User'
      };
      return next();
    }
    if (!token) return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // Fallback to simulated headers if valid
      const simulatedRole = req.headers['x-simulated-role'];
      if (simulatedRole) {
        req.user = {
          id: parseInt(req.headers['x-simulated-user-id'] || '4'),
          role: simulatedRole,
          department: req.headers['x-simulated-dept'] || 'IT Department',
          name: req.headers['x-simulated-name'] || 'User'
        };
        return next();
      }
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    if (req.headers['x-simulated-user-id']) {
      req.user.id = parseInt(req.headers['x-simulated-user-id']);
    }
    if (req.headers['x-simulated-role']) {
      req.user.role = req.headers['x-simulated-role'];
    }
    if (req.headers['x-simulated-dept']) {
      req.user.department = req.headers['x-simulated-dept'];
    }
    next();
  });
}

function checkRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions for role ' + req.user.role });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  checkRole,
  JWT_SECRET
};
