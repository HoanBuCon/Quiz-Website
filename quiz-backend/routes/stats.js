const express = require('express');
const { authRequired } = require('../middleware/auth');
const { query, queryOne } = require('../utils/db');
const { parseJSON, intToBool } = require('../utils/helpers');
const router = express.Router();

// Get classes owned by user
router.get('/owner/classes', authRequired, async (req, res) => {
  try {
    const classes = await query(
      `SELECT id, name, description, isPublic, createdAt, 
        (SELECT COUNT(*) FROM Quiz WHERE classId = Class.id) as quizCount,
        (SELECT COUNT(*) FROM SharedAccess WHERE targetType = 'class' AND targetId = Class.id) as memberCount,
        (SELECT COUNT(*) FROM PublicItem WHERE targetType = 'class' AND targetId = Class.id) as isPublicItem
       FROM Class 
       WHERE ownerId = ? 
       ORDER BY createdAt DESC`,
      [req.user.id]
    );
    
    // Normalize isPublic (legacy + PublicItem)
    const normalized = classes.map(c => ({
      ...c,
      isPublic: intToBool(c.isPublic) || !!c.isPublicItem
    }));
    
    res.json(normalized);
  } catch (error) {
    console.error('Get owner classes error:', error);
    res.status(500).json({ message: 'Failed to fetch classes' });
  }
});

// Get quizzes in a class (owned by user)
router.get('/owner/class/:classId/quizzes', authRequired, async (req, res) => {
  const { classId } = req.params;
  try {
    // Verify ownership
    const cls = await queryOne('SELECT ownerId FROM Class WHERE id = ?', [classId]);
    if (!cls || cls.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const quizzes = await query(
      `SELECT id, title, published, createdAt,
        (SELECT COUNT(*) FROM Question WHERE quizId = Quiz.id) as questionCount,
        (SELECT COUNT(*) FROM QuizSession WHERE quizId = Quiz.id) as attemptCount
       FROM Quiz 
       WHERE classId = ? 
       ORDER BY createdAt DESC`,
      [classId]
    );

    res.json(quizzes.map(q => ({
      ...q,
      published: intToBool(q.published)
    })));
  } catch (error) {
    console.error('Get class quizzes error:', error);
    res.status(500).json({ message: 'Failed to fetch quizzes' });
  }
});

// Get detailed stats for a quiz (participants, results)
router.get('/owner/quiz/:quizId/stats', authRequired, async (req, res) => {
  const { quizId } = req.params;
  try {
    // Verify ownership
    const quiz = await queryOne('SELECT ownerId, title FROM Quiz WHERE id = ?', [quizId]);
    if (!quiz || quiz.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // 1. Get Access List (SharedAccess)
    const accessList = await query(
      `SELECT u.id, u.name, u.email, u.avatarUrl, sa.accessLevel, sa.createdAt as joinedAt
       FROM SharedAccess sa
       JOIN User u ON sa.userId = u.id
       WHERE sa.targetType = 'quiz' AND sa.targetId = ?
       
       UNION
       
       SELECT u.id, u.name, u.email, u.avatarUrl, sa.accessLevel, sa.createdAt as joinedAt
       FROM SharedAccess sa
       JOIN User u ON sa.userId = u.id
       JOIN Quiz q ON q.id = ?
       WHERE sa.targetType = 'class' AND sa.targetId = q.classId
       `,
      [quizId, quizId]
    );

    // 2. Get Sessions (Attempts)
    const sessions = await query(
      `SELECT s.id, s.userId, s.score, s.totalQuestions, s.timeSpent, s.completedAt, 
        u.name as userName, u.email as userEmail, u.avatarUrl
       FROM QuizSession s
       JOIN User u ON s.userId = u.id
       WHERE s.quizId = ?
       ORDER BY s.completedAt DESC`,
      [quizId]
    );

    // 3. Aggregate Stats
    const totalAttempts = sessions.length;
    let avgScore = 0;
    if (totalAttempts > 0) {
      const sum = sessions.reduce((acc, s) => acc + (s.totalQuestions > 0 ? (s.score / s.totalQuestions) * 100 : 0), 0);
      avgScore = Math.round(sum / totalAttempts);
    }
    
    // Determine unique participants
    const uniqueUsers = new Set(sessions.map(s => s.userId)).size;

    res.json({
      quizTitle: quiz.title,
      accessList,
      sessions,
      stats: {
        totalAttempts,
        avgScore,
        uniqueUsers
      }
    });

  } catch (error) {
    console.error('Get quiz stats error:', error);
    res.status(500).json({ message: 'Failed to fetch quiz stats' });
  }
});

module.exports = router;
