const express = require('express');
const requireAuth = require('../middleware/auth');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

router.use(requireAuth);

router.get('/', uploadController.listBatches);

module.exports = router;
