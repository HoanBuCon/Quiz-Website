const express = require('express');
const { authRequired } = require('../middleware/auth');
const { query, queryOne, transaction } = require('../utils/db');
const { generateCuid, formatDateForMySQL, parseJSON, buildWhereIn, boolToInt, intToBool } = require('../utils/helpers');
const { includeMany } = require('../utils/queryHelpers');
const router = express.Router();

// List classes: mine (owned + shared) or public (from PublicItem)
router.get('/', authRequired, async (req, res) => {
  const mine = req.query.mine === 'true';

  if (mine) {
    // Get owned classes
    const owned = await query(
      'SELECT * FROM Class WHERE ownerId = ?',
      [req.user.id]
    );
    
    // Get shared access for this user
    const sharedAccess = await query(
      `SELECT sa.targetId FROM SharedAccess sa
       WHERE sa.userId = ? AND sa.targetType = 'class'
       AND (
         sa.accessLevel = 'full'
         OR EXISTS (
            SELECT 1 FROM Quiz q
            JOIN SharedAccess sa_q ON sa_q.targetId = q.id
            WHERE q.classId = sa.targetId
            AND sa_q.userId = sa.userId
            AND sa_q.targetType = 'quiz'
         )
       )
       AND EXISTS (
          SELECT 1 FROM ShareItem 
          WHERE targetType = 'class' AND targetId = sa.targetId AND isEnabled = 1
       )
       AND NOT EXISTS (
         SELECT 1 FROM BannedAccess ba
         WHERE ba.userId = sa.userId
         AND ba.targetType = 'class'
         AND ba.targetId = sa.targetId
         AND (
            ba.bannedCode = (SELECT code FROM ShareItem WHERE targetType = 'class' AND targetId = sa.targetId AND isEnabled = 1)
            OR NOT EXISTS (SELECT 1 FROM ShareItem WHERE targetType = 'class' AND targetId = sa.targetId AND isEnabled = 1)
         )
       )`,
      [req.user.id]
    );
    
    const sharedIds = sharedAccess.map(s => s.targetId);
    let shared = [];
    
    if (sharedIds.length > 0) {
      const { clause, params } = buildWhereIn(sharedIds);
      shared = await query(`SELECT * FROM Class WHERE id ${clause}`, params);
    }
    
    // Get quizzes for all classes
    const allClasses = [...owned, ...shared];
    if (allClasses.length > 0) {
      await includeMany('Quiz', allClasses, 'classId', 'quizzes');
      
      // FIX: Filter out "hidden" quizzes (where user clicked delete but has class access)
      const hiddenAccess = await query(
         "SELECT targetId FROM SharedAccess WHERE userId = ? AND targetType = 'quiz' AND accessLevel = 'hidden'",
         [req.user.id]
      );
      
      if (hiddenAccess.length > 0) {
         const hiddenIds = new Set(hiddenAccess.map(h => h.targetId));
         for (const cls of allClasses) {
            if (cls.quizzes) {
               cls.quizzes = cls.quizzes.filter(q => !hiddenIds.has(q.id));
            }
         }
      }
    }
    
    // Get ShareItems for owned classes to mark which are shared
    const ownedIds = owned.map(c => c.id);
    let shareMap = new Set();
    
    if (ownedIds.length > 0) {
      const { clause, params } = buildWhereIn(ownedIds);
      const shareItems = await query(
        `SELECT targetId FROM ShareItem WHERE targetType = ? AND targetId ${clause} AND isEnabled = 1`,
        ['class', ...params]
      );
      shareMap = new Set(shareItems.map(s => s.targetId));
    }
    
    // Convert boolean fields and add flags
    const withFlags = [
      ...owned.map(c => ({ 
        ...c, 
        isPublic: intToBool(c.isPublic),
        quizzes: c.quizzes || [],
        accessType: 'owner',
        isShared: shareMap.has(c.id)
      })),
      ...shared.map(c => ({ 
        ...c, 
        isPublic: intToBool(c.isPublic),
        quizzes: c.quizzes || [],
        accessType: 'shared', 
        isShared: true 
      })),
    ];
    
    return res.json(withFlags);
  }

  // PUBLIC LIST
  
  // Get public items
  const pub = await query(
    'SELECT targetId FROM PublicItem WHERE targetType = ?',
    ['class']
  );
  const publicIds = pub.map(p => p.targetId);
  
  // Get classes that are either in PublicItem OR have isPublic=true
  let classes = [];
  if (publicIds.length > 0) {
    const { clause, params } = buildWhereIn(publicIds);
    classes = await query(
      `SELECT * FROM Class WHERE id ${clause} OR isPublic = 1`,
      params
    );
  } else {
    classes = await query('SELECT * FROM Class WHERE isPublic = 1');
  }
  
  // Get quizzes for these classes
  if (classes.length > 0) {
    await includeMany('Quiz', classes, 'classId', 'quizzes');
  }
  
  // Get share items to mark which classes are shareable
  const shareItems = await query(
    'SELECT targetId, code FROM ShareItem WHERE targetType = ? AND isEnabled = 1',
    ['class']
  );
  
  const shareMap = new Map(shareItems.map(s => [s.targetId, s.code]));
  
  const withPublic = classes.map(c => ({
    ...c,
    isPublic: true,
    quizzes: c.quizzes || [],
    accessType: 'public',
    isShared: shareMap.has(c.id),
    shareCode: shareMap.get(c.id) || null
  }));
  
  res.json(withPublic);
});

// Create class
router.post('/', authRequired, async (req, res) => {
  const { name, description, isPublic } = req.body || {};
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  const classId = generateCuid();
  const now = formatDateForMySQL();
  
  await query(
    'INSERT INTO Class (id, name, description, isPublic, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [classId, name, description || null, boolToInt(!!isPublic), req.user.id, now, now]
  );
  
  const cls = await queryOne('SELECT * FROM Class WHERE id = ?', [classId]);
  cls.isPublic = intToBool(cls.isPublic);
  
  res.status(201).json(cls);
});

// Update class
router.put('/:id', authRequired, async (req, res) => {
  const id = req.params.id;
  
  const found = await queryOne('SELECT * FROM Class WHERE id = ?', [id]);
  if (!found || found.ownerId !== req.user.id) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  const { name, description, isPublic } = req.body || {};
  const now = formatDateForMySQL();
  
  await query(
    'UPDATE Class SET name = ?, description = ?, isPublic = ?, updatedAt = ? WHERE id = ?',
    [name, description, boolToInt(isPublic), now, id]
  );

  // sync PublicItem when isPublic provided
  if (typeof isPublic === 'boolean') {
    if (isPublic) {
      // Upsert PublicItem
      const existing = await queryOne(
        'SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?',
        ['class', id]
      );
      
      if (!existing) {
        const publicItemId = generateCuid();
        await query(
          'INSERT INTO PublicItem (id, targetType, targetId, createdAt) VALUES (?, ?, ?, ?)',
          [publicItemId, 'class', id, now]
        );
      }
    } else {
      await query(
        'DELETE FROM PublicItem WHERE targetType = ? AND targetId = ?',
        ['class', id]
      );
    }
  }

  const cls = await queryOne('SELECT * FROM Class WHERE id = ?', [id]);
  cls.isPublic = intToBool(cls.isPublic);
  
  res.json(cls);
});

// Delete class (cascades to quizzes/questions via FK constraints)
router.delete('/:id', authRequired, async (req, res) => {
  const id = req.params.id;
  
  const found = await queryOne('SELECT * FROM Class WHERE id = ?', [id]);
  if (!found || found.ownerId !== req.user.id) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  await query('DELETE FROM Class WHERE id = ?', [id]);
  res.status(204).end();
});

// Import a public class or a quiz by id (clone into current user's space)
router.post('/import', authRequired, async (req, res) => {
  const { classId, quizId } = req.body || {};
  if (!classId && !quizId) {
    return res.status(400).json({ message: 'classId or quizId required' });
  }

  // Helper to clone quiz with questions into target class
  const cloneQuiz = async (conn, sourceQuizId, targetClassId, ownerId) => {
    // Get source quiz
    const [quizRows] = await conn.execute(
      'SELECT q.*, c.isPublic as classIsPublic FROM Quiz q JOIN Class c ON q.classId = c.id WHERE q.id = ?',
      [sourceQuizId]
    );
    
    if (!quizRows || quizRows.length === 0) {
      throw new Error('Quiz not found');
    }
    
    const q = quizRows[0];
    
    // Check permission
    if (!intToBool(q.classIsPublic) && q.ownerId !== ownerId) {
      throw new Error('Forbidden');
    }
    
    // Get all questions for this quiz
    const [questionRows] = await conn.execute(
      'SELECT * FROM Question WHERE quizId = ?',
      [sourceQuizId]
    );
    
    // Create new quiz
    const newQuizId = generateCuid();
    const now = formatDateForMySQL();
    
    await conn.execute(
      'INSERT INTO Quiz (id, title, description, published, classId, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [newQuizId, q.title, q.description, 0, targetClassId, ownerId, now, now]
    );
    
    // Clone questions with proper ID mapping for composite questions
    const questionIdMap = new Map(); // oldId -> newId
    
    for (const qq of questionRows) {
      const oldQuestionId = qq.id;
      const newQuestionId = generateCuid();
      questionIdMap.set(oldQuestionId, newQuestionId);
      
      // Map parentId to new ID if exists
      const newParentId = qq.parentId ? questionIdMap.get(qq.parentId) : null;
      
      await conn.execute(
        'INSERT INTO Question (id, question, type, options, correctAnswers, explanation, questionImage, optionImages, quizId, parentId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          newQuestionId,
          qq.question,
          qq.type,
          qq.options,
          qq.correctAnswers,
          qq.explanation,
          qq.questionImage,
          qq.optionImages,
          newQuizId,
          newParentId  // ✅ Use mapped parent ID
        ]
      );
    }
    
    return newQuizId;
  };

  try {
    if (classId) {
      // Import entire class with all quizzes
      const source = await queryOne('SELECT * FROM Class WHERE id = ?', [classId]);
      if (!source) return res.status(404).json({ message: 'Class not found' });
      if (!intToBool(source.isPublic) && source.ownerId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      
      // Get all quizzes in this class
      const quizzes = await query('SELECT id FROM Quiz WHERE classId = ?', [classId]);
      
      // Create new class and clone all quizzes in transaction
      const result = await transaction(async (conn) => {
        const newClassId = generateCuid();
        const now = formatDateForMySQL();
        
        await conn.execute(
          'INSERT INTO Class (id, name, description, isPublic, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [newClassId, source.name, source.description, 0, req.user.id, now, now]
        );
        
        // Clone each quiz
        for (const q of quizzes) {
          await cloneQuiz(conn, q.id, newClassId, req.user.id);
        }
        
        return { classId: newClassId };
      });
      
      return res.status(201).json(result);
    }

    if (quizId) {
      // Import single quiz (create new class for it)
      const q = await queryOne(
        'SELECT q.*, c.name as className, c.description as classDescription, c.isPublic as classIsPublic FROM Quiz q JOIN Class c ON q.classId = c.id WHERE q.id = ?',
        [quizId]
      );
      
      if (!q) return res.status(404).json({ message: 'Quiz not found' });
      if (!intToBool(q.classIsPublic) && q.ownerId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      
      // Create new class and clone quiz in transaction
      const result = await transaction(async (conn) => {
        const newClassId = generateCuid();
        const now = formatDateForMySQL();
        
        await conn.execute(
          'INSERT INTO Class (id, name, description, isPublic, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [newClassId, `Lớp: ${q.className}`, q.classDescription, 0, req.user.id, now, now]
        );
        
        const newQuizId = await cloneQuiz(conn, q.id, newClassId, req.user.id);
        
        return { classId: newClassId, quizId: newQuizId };
      });
      
      return res.status(201).json(result);
    }
  } catch (error) {
    console.error('Import error:', error);
    return res.status(500).json({ message: error.message || 'Import failed' });
  }
});

module.exports = router;
