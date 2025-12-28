const express = require('express');
const { authRequired } = require('../middleware/auth');
const { query, queryOne } = require('../utils/db');
const { generateCuid, formatDateForMySQL, parseJSON } = require('../utils/helpers');
const router = express.Router();

// Start session (optional; client can also just submit)
router.post('/start', authRequired, async (req, res) => {
  const { quizId } = req.body || {};
  
  const quiz = await queryOne('SELECT id FROM Quiz WHERE id = ?', [quizId]);
  if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
  
  const questionCount = await queryOne(
    'SELECT COUNT(*) as count FROM Question WHERE quizId = ?',
    [quizId]
  );
  
  // Create a QuizAttempt to log that user started the quiz
  const attemptId = generateCuid();
  const now = formatDateForMySQL();
  
  await query(
    'INSERT INTO QuizAttempt (id, userId, quizId, startedAt) VALUES (?, ?, ?, ?)',
    [attemptId, req.user.id, quizId, now]
  );
  
  res.json({ 
    quizId: quiz.id, 
    totalQuestions: questionCount.count, 
    attemptId 
  });
});

// Submit answers and score server-side (supports composite and drag)
router.post('/submit', authRequired, async (req, res) => {
  const { quizId, answers, timeSpent, attemptId } = req.body || {};
  
  const quiz = await queryOne('SELECT id FROM Quiz WHERE id = ?', [quizId]);
  if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
  
  // Get all questions for this quiz
  const allQs = await query('SELECT * FROM Question WHERE quizId = ?', [quizId]);
  
  // Parse JSON fields
  for (const q of allQs) {
    q.options = parseJSON(q.options);
    q.correctAnswers = parseJSON(q.correctAnswers);
    q.optionImages = parseJSON(q.optionImages);
  }
  
  const userAnswers = answers || {}; // map questionId -> any

  // Build nested maps
  const childrenByParent = new Map();
  for (const q of allQs) {
    const pid = q.parentId || null;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(q);
  }
  const roots = childrenByParent.get(null) || [];

  // Define leaf questions list (exclude composite parent from scoring)
  const leafQuestions = [];
  for (const r of roots) {
    if (r.type === 'composite') {
      for (const c of (childrenByParent.get(r.id) || [])) leafQuestions.push(c);
    } else {
      leafQuestions.push(r);
    }
  }

  let score = 0;
  for (const q of leafQuestions) {
    const ans = userAnswers[q.id];
    if (q.type === 'text') {
      const ua = ((Array.isArray(ans) ? ans[0] : ans) || '').toString().trim().toLowerCase();
      const correct = (q.correctAnswers || []).some(c => (c || '').toString().trim().toLowerCase() === ua);
      if (correct) score += 1;
    } else if (q.type === 'drag') {
      // Expect answer as { [itemId]: targetId }
      const mapping = ans && typeof ans === 'object' ? ans : {};
      const correctMap = q.correctAnswers || {};
      
      // Lấy tất cả items từ question.options để kiểm tra đầy đủ
      const allItems = (q.options && q.options.items) ? q.options.items : [];
      
      // Kiểm tra từng item
      const ok = allItems.length > 0 && allItems.every(item => {
        const itemId = item.id;
        const userTargetId = mapping[itemId];
        const correctTargetId = correctMap[itemId];
        
        // Chuẩn hóa giá trị: undefined, null, '' đều được coi là "không thuộc nhóm nào"
        const normalizedUserTarget = userTargetId || undefined;
        const normalizedCorrectTarget = correctTargetId || undefined;
        
        return normalizedUserTarget === normalizedCorrectTarget;
      });
      
      if (ok) score += 1;
    } else {
      const arr = Array.isArray(ans) ? ans : [];
      const correctArr = q.correctAnswers || [];
      const ok = arr.length === correctArr.length && correctArr.every(a => arr.includes(a));
      if (ok) score += 1;
    }
  }

  const sessionId = generateCuid();
  const now = formatDateForMySQL();
  
  // Create snapshot of the quiz (questions with correct answers at this point in time)
  // We use leafQuestions because that's what we scored, but for a full UI reproduction we might want the original structure.
  // However, leafQuestions contains all info needed to reconstruct a view if we handle it right.
  // Better: Store the 'allQs' but perhaps structured? 
  // Requirement says: "Save full content... same as displayed in ResultPage".
  // ResultsPage currently uses nested structure. Let's save the RAW nested structure that the frontend expects?
  // Or just save the flat list 'allQs' and let frontend re-nest it (ResultPage does re-nesting if needed, but it usually takes 'quiz' object).
  // Let's safe the full 'quiz' object state + questions.
  
  // Re-fetch clean questions just to be sure we have everything (though allQs is fine).
  // Let's format 'allQs' into the structure the frontend expects if possible, OR just save 'allQs' as a list and 'quiz' metadata.
  // Simple approach: Save 'questions' list.
  
  // Build nested structure for snapshot to match frontend expectations (QuizzesAPI.getById format)
  // Re-attach children to parents
  const snapshotQs = allQs.map(q => ({ ...q })); // Clone to avoid mutation issues
  const byParentForSnapshot = new Map();
  for (const q of snapshotQs) {
    const pid = q.parentId || null;
    if (!byParentForSnapshot.has(pid)) byParentForSnapshot.set(pid, []);
    byParentForSnapshot.get(pid).push(q);
  }
  
  const rootSnapshotQs = (byParentForSnapshot.get(null) || []).map(p => ({ 
    ...p, 
    subQuestions: (byParentForSnapshot.get(p.id) || []) 
  }));

  const snapshotData = {
    quizTitle: quiz.title,
    questions: rootSnapshotQs
  };

  await query(
    'INSERT INTO QuizSession (id, quizId, userId, score, totalQuestions, timeSpent, answers, quizSnapshot, startedAt, completedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [sessionId, quiz.id, req.user.id, score, leafQuestions.length, Number(timeSpent || 0), JSON.stringify(userAnswers), JSON.stringify(snapshotData), now, now]
  );

  // If an attemptId was provided, link it to this session and mark endedAt
  if (attemptId) {
    try {
      const attempt = await queryOne(
        'SELECT id, userId, quizId FROM QuizAttempt WHERE id = ?',
        [attemptId]
      );
      
      if (attempt && attempt.userId === req.user.id && attempt.quizId === quiz.id) {
        await query(
          'UPDATE QuizAttempt SET endedAt = ?, quizSessionId = ? WHERE id = ?',
          [now, sessionId, attemptId]
        );
      }
    } catch (_) {}
  }

  res.status(201).json({
    sessionId,
    score,
    totalQuestions: leafQuestions.length,
    percentage: leafQuestions.length ? Math.round((score / leafQuestions.length) * 100) : 0
  });
});

// Mark attempt ended without submission (user left quiz page)
router.post('/attempt/end', authRequired, async (req, res) => {
  const { attemptId } = req.body || {};
  if (!attemptId) return res.status(400).json({ message: 'Missing attemptId' });
  
  try {
    const attempt = await queryOne(
      'SELECT id, userId, endedAt FROM QuizAttempt WHERE id = ?',
      [attemptId]
    );
    
    if (!attempt || attempt.userId !== req.user.id) {
      return res.status(404).json({ message: 'Not found' });
    }
    
    if (!attempt.endedAt) {
      const now = formatDateForMySQL();
      await query(
        'UPDATE QuizAttempt SET endedAt = ? WHERE id = ?',
        [now, attemptId]
      );
    }
    
    res.status(204).end();
  } catch (_e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get my results for a quiz (privacy-safe: no answers payload)
router.get('/by-quiz/:quizId', authRequired, async (req, res) => {
  const quizId = req.params.quizId;
  
  const quiz = await queryOne('SELECT ownerId FROM Quiz WHERE id = ?', [quizId]);
  if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

  let sessions;
  // If owner, show all sessions (limit 50). If student, show only theirs.
  if (quiz.ownerId === req.user.id) {
    sessions = await query(
      `SELECT id, quizId, score, totalQuestions, timeSpent, startedAt, completedAt, userId
       FROM QuizSession 
       WHERE quizId = ? 
       ORDER BY completedAt DESC
       LIMIT 50`,
      [quizId]
    );
  } else {
    sessions = await query(
      `SELECT id, quizId, score, totalQuestions, timeSpent, startedAt, completedAt
       FROM QuizSession 
       WHERE quizId = ? AND userId = ? 
       ORDER BY completedAt DESC`,
      [quizId, req.user.id]
    );
  }
  
  res.json(sessions);
});

// Get a session by id (includes answers; only owner can access)
router.get('/:id', authRequired, async (req, res) => {
  const id = req.params.id;
  
  const session = await queryOne('SELECT * FROM QuizSession WHERE id = ?', [id]);
  if (!session) {
    return res.status(404).json({ message: 'Not found' });
  }

  // Check access: User owning the session OR Owner of the quiz
  if (session.userId !== req.user.id) {
    const quiz = await queryOne('SELECT ownerId FROM Quiz WHERE id = ?', [session.quizId]);
    if (!quiz || quiz.ownerId !== req.user.id) {
      return res.status(404).json({ message: 'Not found' });
    }
  }
  
  // Parse JSON field
  session.answers = parseJSON(session.answers);
  session.quizSnapshot = parseJSON(session.quizSnapshot);
  
  res.json(session);
});

module.exports = router;
