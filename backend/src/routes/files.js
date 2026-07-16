const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const uploadController = require('../controllers/uploadController');
const fileController = require('../controllers/fileController');

const router = express.Router();

router.use(requireAuth);

router.post('/bulk-upload', upload.single('file'), uploadController.bulkUpload);

router.get('/', fileController.list);
router.get('/:id', fileController.getById);
router.put('/:id', requireRole('superadmin'), fileController.update);
router.delete('/:id', requireRole('superadmin'), fileController.remove);

module.exports = router;
