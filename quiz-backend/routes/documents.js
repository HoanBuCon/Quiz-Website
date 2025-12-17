const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authRequired } = require('../middleware/auth');
const { query, queryOne } = require('../utils/db');
const { generateCuid, formatDateForMySQL } = require('../utils/helpers');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const documentsBasePath = isProd
  ? path.join(__dirname, '../documents')
  : path.join(__dirname, '../public/documents');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Organize files by year/month for better management
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const uploadDir = path.join(documentsBasePath, String(year), month);
    
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error, '');
    }
  },
  filename: (req, file, cb) => {
    const uniqueId = generateCuid();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'text/plain', // .txt
    'application/json' // .json
  ];
  
  if (allowedTypes.includes(file.mimetype) || 
      file.originalname.match(/\.(doc|docx|txt|json)$/i)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file .doc, .docx, .txt, .json'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Upload document
router.post('/upload', authRequired, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const relativePath = `files/documents/${year}/${month}/${req.file.filename}`;
    
    const fileId = generateCuid();
    const now = formatDateForMySQL();
    
    // Determine file type
    const ext = path.extname(req.file.originalname).toLowerCase();
    let fileType = 'txt';
    if (ext === '.doc' || ext === '.docx') fileType = 'docs';
    else if (ext === '.json') fileType = 'json';
    
    // Store in database with file path
    await query(
      `INSERT INTO UploadedFile (id, name, type, size, filePath, uploadedAt, userId) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileId, req.file.originalname, fileType, req.file.size, relativePath, now, req.user.id]
    );
    
    const file = await queryOne(
      'SELECT id, name, type, size, filePath, uploadedAt, userId FROM UploadedFile WHERE id = ?',
      [fileId]
    );
    
    res.status(201).json(file);
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file if database insert fails
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Failed to clean up file:', unlinkError);
      }
    }
    
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

// List user's documents
router.get('/', authRequired, async (req, res) => {
  try {
    const files = await query(
      `SELECT id, name, type, size, filePath, uploadedAt, userId 
       FROM UploadedFile 
       WHERE userId = ? 
       ORDER BY uploadedAt DESC`,
      [req.user.id]
    );
    res.json(files);
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ message: 'Failed to list documents' });
  }
});

// Get document by ID (with file path)
router.get('/:id', authRequired, async (req, res) => {
  try {
    const file = await queryOne(
      `SELECT id, name, type, size, filePath, content, uploadedAt, userId 
       FROM UploadedFile 
       WHERE id = ?`,
      [req.params.id]
    );
    
    if (!file || file.userId !== req.user.id) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    res.json(file);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ message: 'Failed to get document' });
  }
});

// Delete document
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const file = await queryOne(
      'SELECT id, userId, filePath FROM UploadedFile WHERE id = ?',
      [req.params.id]
    );
    
    if (!file || file.userId !== req.user.id) {
      return res.status(404).json({ message: 'Not found' });
    }
    
    // Delete from database
    await query('DELETE FROM UploadedFile WHERE id = ?', [req.params.id]);
    
    // Delete physical file
    if (file.filePath) {
      const fullPath = path.join(__dirname, '..', file.filePath);
      try {
        await fs.unlink(fullPath);
        console.log(`Deleted file: ${fullPath}`);
      } catch (error) {
        console.error('Failed to delete physical file:', error);
        // Don't fail the request if file deletion fails
      }
    }
    
    res.status(204).end();
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Failed to delete document' });
  }
});

module.exports = router;
