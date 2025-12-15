const express = require('express');
const { authRequired } = require('../middleware/auth');
const { query, queryOne, transaction } = require('../utils/db');
const { generateCuid, formatDateForMySQL, parseJSON, buildWhereIn, boolToInt, intToBool } = require('../utils/helpers');
const router = express.Router();

// Get quizzes by class
router.get('/by-class/:classId', authRequired, async (req, res) => {
  const classId = req.params.classId;

  const cls = await queryOne('SELECT * FROM Class WHERE id = ?', [classId]);
  if (!cls) return res.status(404).json({ message: 'Class not found' });

  const isOwner = cls.ownerId === req.user.id;
  
  const hasPublicItem = await queryOne(
    'SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?',
    ['class', classId]
  );
  
  const isPublic = intToBool(cls.isPublic) || !!hasPublicItem;
  
  const hasShared = await queryOne(
    'SELECT id, accessLevel FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
    [req.user.id, 'class', classId]
  );
  
  // Allow access if: Owner, Public class, or has SharedAccess
  if (!isOwner && !isPublic && !hasShared) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Fetch quizzes with question count
  const quizzes = await query(`
    SELECT 
      q.id, q.title, q.description, q.published, q.createdAt, q.updatedAt, q.ownerId,
      (SELECT COUNT(*) FROM Question WHERE quizId = q.id) as questionCount
    FROM Quiz q
    WHERE q.classId = ?
  `, [classId]);
  
  const quizIds = quizzes.map(q => q.id);
  let shareItems = [];
  
  if (quizIds.length > 0) {
    const { clause, params } = buildWhereIn(quizIds);
    shareItems = await query(
      `SELECT targetId FROM ShareItem WHERE targetType = ? AND targetId ${clause}`,
      ['quiz', ...params]
    );
  }
  
  const sharedSet = new Set(shareItems.map(s => s.targetId));
  
  // Filter quizzes based on access level
  let accessibleQuizzes = quizzes;
  
  if (!isOwner && !isPublic && hasShared) {
    const classAccessLevel = hasShared.accessLevel;
    
    if (classAccessLevel === 'full') {
      // User has full access to ALL quizzes
      accessibleQuizzes = quizzes;
    } else if (classAccessLevel === 'navigationOnly') {
      // User only has access to specific quizzes they've claimed
      let userQuizAccess = [];
      
      if (quizIds.length > 0) {
        const { clause, params } = buildWhereIn(quizIds);
        userQuizAccess = await query(
          `SELECT targetId FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId ${clause}`,
          [req.user.id, 'quiz', ...params]
        );
      }
      
      const accessibleQuizIds = new Set(userQuizAccess.map(a => a.targetId));
      accessibleQuizzes = quizzes.filter(q => accessibleQuizIds.has(q.id));
    }
  }
  
  // Map to payload
  const payload = accessibleQuizzes.map(q => ({
    id: q.id,
    title: q.title,
    description: q.description,
    published: intToBool(q.published),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    questionCount: q.questionCount || 0,
    isShared: sharedSet.has(q.id)
  }));
  
  res.json(payload);
});

// Create quiz with questions (supports composite and drag)
router.post('/', authRequired, async (req, res) => {
  const { classId, title, description, published, questions } = req.body || {};
  if (!classId || !title) {
    return res.status(400).json({ message: 'classId and title are required' });
  }
  
  const cls = await queryOne('SELECT * FROM Class WHERE id = ?', [classId]);
  if (!cls || cls.ownerId !== req.user.id) {
    return res.status(404).json({ message: 'Class not found' });
  }

  try {
    const result = await transaction(async (conn) => {
      const quizId = generateCuid();
      const now = formatDateForMySQL();
      
      // Create quiz
      await conn.execute(
        'INSERT INTO Quiz (id, title, description, published, classId, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [quizId, title, description || null, boolToInt(!!published), classId, req.user.id, now, now]
      );

      // Create questions (including composite children)
      const createOne = async (q, parentId = null) => {
        const questionId = generateCuid();
        
        await conn.execute(
          'INSERT INTO Question (id, quizId, parentId, question, type, options, correctAnswers, explanation, questionImage, optionImages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            questionId,
            quizId,
            parentId,
            q.question,
            q.type,
            q.options ? JSON.stringify(q.options) : null,
            JSON.stringify(q.correctAnswers || []),
            q.explanation || null,
            q.questionImage || null,
            q.optionImages ? JSON.stringify(q.optionImages) : null
          ]
        );
        
        if (q.type === 'composite' && Array.isArray(q.subQuestions)) {
          for (const cq of q.subQuestions) {
            await createOne(cq, questionId);
          }
        }
        
        return questionId;
      };

      for (const q of (questions || [])) {
        await createOne(q, null);
      }
      
      return quizId;
    });
    
    // Fetch created quiz with questions
    const quiz = await queryOne('SELECT * FROM Quiz WHERE id = ?', [result]);
    const questionsList = await query('SELECT * FROM Question WHERE quizId = ?', [result]);
    
    // Parse JSON fields
    for (const q of questionsList) {
      q.options = parseJSON(q.options);
      q.correctAnswers = parseJSON(q.correctAnswers);
      q.optionImages = parseJSON(q.optionImages);
    }
    
    quiz.published = intToBool(quiz.published);
    quiz.questions = questionsList;
    
    res.status(201).json(quiz);
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ message: 'Failed to create quiz' });
  }
});

// Update quiz (and replace questions; supports composite and drag)
router.put('/:id', authRequired, async (req, res) => {
  const id = req.params.id;
  
  const found = await queryOne('SELECT * FROM Quiz WHERE id = ?', [id]);
  if (!found || found.ownerId !== req.user.id) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  const { title, description, published, questions } = req.body || {};
  
  try {
    await transaction(async (conn) => {
      const now = formatDateForMySQL();
      
      // Update quiz fields
      await conn.execute(
        'UPDATE Quiz SET title = ?, description = ?, published = ?, updatedAt = ? WHERE id = ?',
        [title, description, boolToInt(published), now, id]
      );

      // Sync PublicItem when published provided
      if (typeof published === 'boolean') {
        if (published) {
          // Upsert PublicItem
          const [existing] = await conn.execute(
            'SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?',
            ['quiz', id]
          );
          
          if (!existing || existing.length === 0) {
            const publicItemId = generateCuid();
            await conn.execute(
              'INSERT INTO PublicItem (id, targetType, targetId, createdAt) VALUES (?, ?, ?, ?)',
              [publicItemId, 'quiz', id, now]
            );
          }
        } else {
          await conn.execute(
            'DELETE FROM PublicItem WHERE targetType = ? AND targetId = ?',
            ['quiz', id]
          );
        }
      }

      if (Array.isArray(questions)) {
        // Replace questions: delete then recreate (including children)
        await conn.execute('DELETE FROM Question WHERE quizId = ?', [id]);
        
        const createOne = async (q, parentId = null) => {
          const questionId = generateCuid();
          
          await conn.execute(
            'INSERT INTO Question (id, quizId, parentId, question, type, options, correctAnswers, explanation, questionImage, optionImages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              questionId,
              id,
              parentId,
              q.question,
              q.type,
              q.options ? JSON.stringify(q.options) : null,
              JSON.stringify(q.correctAnswers || []),
              q.explanation || null,
              q.questionImage || null,
              q.optionImages ? JSON.stringify(q.optionImages) : null
            ]
          );
          
          if (q.type === 'composite' && Array.isArray(q.subQuestions)) {
            for (const cq of q.subQuestions) {
              await createOne(cq, questionId);
            }
          }
          
          return questionId;
        };
        
        for (const q of questions) {
          await createOne(q, null);
        }
      }
    });
    
    // Fetch updated quiz with questions
    const quiz = await queryOne('SELECT * FROM Quiz WHERE id = ?', [id]);
    const questionsList = await query('SELECT * FROM Question WHERE quizId = ?', [id]);
    
    // Parse JSON fields
    for (const q of questionsList) {
      q.options = parseJSON(q.options);
      q.correctAnswers = parseJSON(q.correctAnswers);
      q.optionImages = parseJSON(q.optionImages);
    }
    
    quiz.published = intToBool(quiz.published);
    quiz.questions = questionsList;
    
    res.json(quiz);
  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({ message: 'Failed to update quiz' });
  }
});

// Delete quiz
router.delete('/:id', authRequired, async (req, res) => {
  const id = req.params.id;
  
  const found = await queryOne('SELECT * FROM Quiz WHERE id = ?', [id]);
  if (!found || found.ownerId !== req.user.id) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  // Get all questions to clean up images
  const questions = await query('SELECT * FROM Question WHERE quizId = ?', [id]);
  
  // Parse JSON fields for image cleanup
  for (const q of questions) {
    q.optionImages = parseJSON(q.optionImages);
  }
  
  // Image cleanup
  const fs = require('fs');
  const path = require('path');
  const isProd = process.env.NODE_ENV === 'production';
  const uploadDir = isProd 
    ? path.join(__dirname, '../../uploads/images')
    : path.join(__dirname, '../public/uploads/images');
  
  const deleteImageFromUrl = (imageUrl) => {
    if (!imageUrl || !imageUrl.includes('/uploads/images/')) return;
    
    try {
      const filename = imageUrl.split('/uploads/images/').pop();
      const filePath = path.join(uploadDir, filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✓ Deleted image: ${filename}`);
      }
    } catch (err) {
      console.error(`✗ Failed to delete image from URL ${imageUrl}:`, err);
    }
  };
  
  // Delete all images
  for (const question of questions) {
    if (question.questionImage) {
      deleteImageFromUrl(question.questionImage);
    }
    
    if (question.optionImages && typeof question.optionImages === 'object') {
      const optionImages = Array.isArray(question.optionImages) 
        ? question.optionImages 
        : Object.values(question.optionImages);
      
      for (const imgUrl of optionImages) {
        if (imgUrl) deleteImageFromUrl(imgUrl);
      }
    }
  }
  
  await query('DELETE FROM Quiz WHERE id = ?', [id]);
  res.status(204).end();
});

// Get quiz by ID or shortId (supports public/share) and return nested structure
router.get('/:id', authRequired, async (req, res) => {
  const id = req.params.id;
  
  try {
    let quiz = await queryOne('SELECT * FROM Quiz WHERE id = ?', [id]);
    
    // If not found, try shortId lookup
    if (!quiz) {
      const { buildShortId } = require('../utils/share');
      const all = await query('SELECT * FROM Quiz');
      quiz = all.find(q => buildShortId(q.id) === id);
    }
    
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const isOwner = quiz.ownerId === req.user.id;
    
    const quizPublic = await queryOne(
      'SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?',
      ['quiz', quiz.id]
    );
    
    const classPublic = await queryOne(
      'SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?',
      ['class', quiz.classId]
    );
    
    const hasQuizShared = await queryOne(
      'SELECT id FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
      [req.user.id, 'quiz', quiz.id]
    );
    
    const hasClassShared = await queryOne(
      'SELECT id, accessLevel FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
      [req.user.id, 'class', quiz.classId]
    );
    
    // Get class info for legacy isPublic check and name
    const cls = await queryOne('SELECT isPublic, name FROM Class WHERE id = ?', [quiz.classId]);
    const isClassPublicLegacy = cls ? intToBool(cls.isPublic) : false;

    // Access rules
    const hasAccess = isOwner 
      || quizPublic 
      || classPublic 
      || isClassPublicLegacy 
      || hasQuizShared 
      || (hasClassShared && hasClassShared.accessLevel === 'full');

    if (!hasAccess) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Get all questions
    const allQs = await query('SELECT * FROM Question WHERE quizId = ?', [quiz.id]);
    
    // Parse JSON fields
    for (const q of allQs) {
      q.options = parseJSON(q.options);
      q.correctAnswers = parseJSON(q.correctAnswers);
      q.optionImages = parseJSON(q.optionImages);
    }

    // Build nested structure: parents first, attach children as subQuestions
    const byParent = new Map();
    for (const q of allQs) {
      const pid = q.parentId || null;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(q);
    }
    
    const roots = (byParent.get(null) || []).map(p => ({ 
      ...p, 
      subQuestions: (byParent.get(p.id) || []) 
    }));

    quiz.published = intToBool(quiz.published);
    quiz.questions = roots;
    quiz.className = cls ? cls.name : null;
    
    res.json(quiz);
  } catch (e) {
    console.error('Error fetching quiz', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
