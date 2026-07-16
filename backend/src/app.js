const express = require('express');
const cors = require('cors');
const multer = require('multer');

const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const uploadsRoutes = require('./routes/uploads');
const statsRoutes = require('./routes/stats');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Permohonan SLO Archive backend is running' });
});

app.use('/auth', authRoutes);
app.use('/files', filesRoutes);
app.use('/upload-batches', uploadsRoutes);
app.use('/stats', statsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { message: err.message, code: err.code } });
  }
  if (err.status) {
    return res
      .status(err.status)
      .json({ error: { message: err.message, code: err.code || 'BAD_REQUEST' } });
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});

module.exports = app;
