const express = require('express');
const authController = require('../controllers/authController');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.post('/login', authController.login);
router.put('/password', requireAuth, authController.changePassword);

module.exports = router;
