const multer = require('multer');
const path = require('path');

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE },
  fileFilter: (req, file, cb) => {
    const extOk = path.extname(file.originalname).toLowerCase() === '.pdf';
    const mimeOk = file.mimetype === 'application/pdf';
    if (!extOk || !mimeOk) {
      const err = new Error('Only .pdf files are accepted');
      err.status = 400;
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = uploadPdf;
