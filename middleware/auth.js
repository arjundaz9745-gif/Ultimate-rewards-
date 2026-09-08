function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Login required' });
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Login required' });
  }
  if (!req.session.user.is_staff) {
    return res.status(403).json({ error: 'Staff only' });
  }
  next();
}

module.exports = { requireLogin, requireStaff };
