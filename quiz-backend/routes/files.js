const express = require('express');
const { authRequired } = require('../middleware/auth');
const { query, queryOne } = require('../utils/db');
const { generateCuid, formatDateForMySQL } = require('../utils/helpers');
const router = express.Router();

// List my files
router.get('/', authRequired, async (req, res) => {
  const files = await query(
    'SELECT id, name, type, size, uploadedAt, userId FROM UploadedFile WHERE userId = ? ORDER BY uploadedAt DESC',
    [req.user.id]
  );
  res.json(files);
});

// Upload (metadata + optional content base64 for .docx)
router.post('/', authRequired, async (req, res) => {
  const { name, type, size, content } = req.body || {};
  if (!name || !type || typeof size !== 'number') return res.status(400).json({ message: 'Invalid payload' });
  
  const fileId = generateCuid();
  const now = formatDateForMySQL();
  
  await query(
    'INSERT INTO UploadedFile (id, name, type, size, content, uploadedAt, userId) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [fileId, name, type, size, content || null, now, req.user.id]
  );
  
  const file = await queryOne('SELECT id, name, type, size, uploadedAt, userId FROM UploadedFile WHERE id = ?', [fileId]);
  res.status(201).json(file);
});

// Delete file
router.delete('/:id', authRequired, async (req, res) => {
  const id = req.params.id;
  const file = await queryOne('SELECT id, userId FROM UploadedFile WHERE id = ?', [id]);
  if (!file || file.userId !== req.user.id) return res.status(404).json({ message: 'Not found' });
  await query('DELETE FROM UploadedFile WHERE id = ?', [id]);
  res.status(204).end();
});

module.exports = router;

