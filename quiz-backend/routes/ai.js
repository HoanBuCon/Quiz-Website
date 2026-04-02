const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authRequired } = require('../middleware/auth');
const aiService = require('../services/aiService');
const fs = require('fs');
const path = require('path');

// Configure multer for temp file upload
const uploadDir = path.join(__dirname, '../public/uploads/temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'ai-upload-' + uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

router.post('/generate', authRequired, upload.array('files'), async (req, res) => {
    try {
        let config = {};
        if (req.body.config) {
            try {
                config = JSON.parse(req.body.config);
            } catch (e) {
                return res.status(400).json({ message: 'Invalid config JSON' });
            }
        }
        
        // Pass uploaded files to config
        if (req.files && req.files.length > 0) {
            config.files = req.files;
        }

        const result = await aiService.generateQuiz(config);

        // Delete temporary files after generation
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    fs.unlinkSync(file.path);
                } catch (e) {
                    console.error("Failed to delete temp file:", file.path);
                }
            }
        }

        // result is either { textContent } (theory mode) or { questions } (extract mode)
        res.json(result);
    } catch (error) {
        console.error('AI generate endpoint error:', error);
        
        // Clean up temp files on error
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                } catch (e) {
                    // Ignore
                }
            }
        }

        res.status(500).json({ message: 'Failed to generate quiz', error: error.message });
    }
});

module.exports = router;
