const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const uploadPdf = require('../middleware/uploadPdf');
const uploadController = require('../controllers/uploadController');
const fileController = require('../controllers/fileController');

const router = express.Router();

router.use(requireAuth);

router.post('/bulk-upload', upload.single('file'), uploadController.bulkUpload);

router.get('/', fileController.list);
router.get('/:id', fileController.getById);
router.put('/:id', requireRole('superadmin'), fileController.update);
router.delete('/:id', requireRole('superadmin'), fileController.remove);

router.get('/:id/pdf', fileController.getPdf);
router.post('/:id/pdf', requireRole('superadmin'), uploadPdf.single('file'), fileController.uploadPdf);
router.delete('/:id/pdf', requireRole('superadmin'), fileController.deletePdf);

module.exports = router;
