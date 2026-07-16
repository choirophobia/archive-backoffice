const uploadService = require('../services/uploadService');

async function bulkUpload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { message: 'No file uploaded (expected multipart field "file")', code: 'NO_FILE' },
      });
    }

    const summary = await uploadService.processUpload(req.file.buffer, {
      uploadedBy: req.user.id,
      filename: req.file.originalname,
    });
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function listBatches(req, res, next) {
  try {
    res.json(await uploadService.listBatches());
  } catch (err) {
    next(err);
  }
}

module.exports = { bulkUpload, listBatches };
