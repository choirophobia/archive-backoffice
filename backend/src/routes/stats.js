const express = require('express');
const requireAuth = require('../middleware/auth');
const statsController = require('../controllers/statsController');

const router = express.Router();

router.use(requireAuth);

router.get('/', statsController.getStats);

module.exports = router;
