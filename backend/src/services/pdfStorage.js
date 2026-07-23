const fs = require('fs');
const path = require('path');

// One PDF per archive_files row, stored on disk as `<id>.pdf` — the row id is
// always a UUID validated by the caller, so it's safe to use directly as a
// filename with no path-traversal risk.
const PDF_DIR = process.env.PDF_STORAGE_DIR || path.join(__dirname, '../../storage/pdfs');

fs.mkdirSync(PDF_DIR, { recursive: true });

function pdfPath(id) {
  return path.join(PDF_DIR, `${id}.pdf`);
}

function savePdf(id, buffer) {
  fs.writeFileSync(pdfPath(id), buffer);
}

function deletePdfFile(id) {
  try {
    fs.unlinkSync(pdfPath(id));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { PDF_DIR, pdfPath, savePdf, deletePdfFile };
