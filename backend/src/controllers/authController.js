const authService = require('../services/authService');

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: { message: 'Email and password are required', code: 'INVALID_INPUT' },
      });
    }

    const user = await authService.verifyCredentials(email, password);

    if (!user) {
      return res.status(401).json({
        error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
      });
    }

    const token = authService.generateToken(user);
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: { message: 'Current and new password are required', code: 'INVALID_INPUT' },
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: { message: 'New password must be at least 8 characters', code: 'INVALID_INPUT' },
      });
    }

    const result = await authService.changePassword(req.user.id, currentPassword, newPassword);

    if (!result.ok) {
      return res.status(401).json({
        error: { message: 'Current password is incorrect', code: 'INVALID_CREDENTIALS' },
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, changePassword };
