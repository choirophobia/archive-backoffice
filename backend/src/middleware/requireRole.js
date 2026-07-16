// Gate a route to specific roles. Must run after requireAuth so req.user is set.
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({
        error: { message: 'You do not have permission to perform this action', code: 'FORBIDDEN' },
      });
    }
    next();
  };
}

module.exports = requireRole;
