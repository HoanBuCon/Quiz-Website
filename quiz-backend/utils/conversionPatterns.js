/**
 * CONVERSION PATTERNS - Chi tiết cách chuyển đổi từng pattern
 * File này cung cấp examples cụ thể cho mọi pattern trong dự án
 */

const { query, queryOne, transaction } = require('./db');
const { generateCuid, formatDateForMySQL, parseJSON, stringifyJSON, buildWhereIn, boolToInt } = require('./helpers');
const { includeMany, includeOne, countRelated, parseJSONFields, convertBoolFields } = require('./queryHelpers');

// =============================================
// PATTERN 1: GET LIST WITH RELATIONS
// =============================================

async function getClassesWithQuizzes_PRISMA_STYLE() {
  // PRISMA CODE (CŨ):
  // const classes = await prisma.class.findMany({
  //   where: { ownerId: req.user.id },
  //   include: { quizzes: true }
  // });
  
  // MYSQL CODE (MỚI):
  const classes = await query(
    'SELECT * FROM Class WHERE ownerId = ? ORDER BY createdAt DESC',
    [req.user.id]
  );
  
  // Load quizzes for each class
  await includeMany('Quiz', classes, 'classId', 'quizzes');
  
  // Convert boolean fields
  convertBoolFields(classes, ['isPublic']);
  
  return classes;
}

// =============================================
// PATTERN 2: GET WITH COMPLEX WHERE CONDITIONS
// =============================================

async function getPublicClasses_PRISMA_STYLE() {
  // PRISMA CODE (CŨ):
  // const pub = await prisma.publicItem.findMany({ where: { targetType: 'class' } });
  // const ids = pub.map(p => p.targetId);
  // const classes = await prisma.class.findMany({
  //   where: {
  //     OR: [
  //       { id: { in: ids } },
  //       { isPublic: true },
  //     ]
  //   },
  //   include: { quizzes: true }
  // });
  
  // MYSQL CODE (MỚI):
  const pub = await query(
    'SELECT targetId FROM PublicItem WHERE targetType = ?',
    ['class']
  );
  const ids = pub.map(p => p.targetId);
  
  let classes;
  if (ids.length > 0) {
    const { clause, params } = buildWhereIn(ids);
    classes = await query(
      `SELECT * FROM Class WHERE id ${clause} OR isPublic = 1`,
      params
    );
  } else {
    classes = await query('SELECT * FROM Class WHERE isPublic = 1', []);
  }
  
  await includeMany('Quiz', classes, 'classId', 'quizzes');
  convertBoolFields(classes, ['isPublic']);
  
  return classes;
}

// =============================================
// PATTERN 3: CREATE WITH NESTED DATA
// =============================================

async function createQuizWithQuestions_PRISMA_STYLE(quizData, questions) {
  // PRISMA CODE (CŨ):
  // const quiz = await prisma.quiz.create({
  //   data: {
  //     title: quizData.title,
  //     classId: quizData.classId,
  //     ownerId: quizData.ownerId,
  //     questions: {
  //       create: questions.map(q => ({
  //         question: q.question,
  //         type: q.type,
  //         correctAnswers: q.correctAnswers
  //       }))
  //     }
  //   },
  //   include: { questions: true }
  // });
  
  // MYSQL CODE (MỚI):
  const quizId = generateCuid();
  const now = formatDateForMySQL();
  
  await transaction(async (conn) => {
    // Create quiz
    await conn.execute(
      'INSERT INTO Quiz (id, title, classId, ownerId, published, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [quizId, quizData.title, quizData.classId, quizData.ownerId, boolToInt(quizData.published || false), now, now]
    );
    
    // Create questions
    for (const q of questions) {
      const qId = generateCuid();
      await conn.execute(
        'INSERT INTO Question (id, quizId, question, type, options, correctAnswers, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [qId, quizId, q.question, q.type, stringifyJSON(q.options), stringifyJSON(q.correctAnswers), now]
      );
    }
  });
  
  // Fetch created quiz with questions
  const quiz = await queryOne('SELECT * FROM Quiz WHERE id = ?', [quizId]);
  quiz.questions = await query('SELECT * FROM Question WHERE quizId = ?', [quizId]);
  
  // Parse JSON fields
  parseJSONFields(quiz.questions, ['options', 'correctAnswers', 'optionImages']);
  convertBoolFields(quiz, ['published']);
  
  return quiz;
}

// =============================================
// PATTERN 4: UPDATE WITH REPLACE CHILDREN
// =============================================

async function updateQuizWithQuestions_PRISMA_STYLE(quizId, updateData, newQuestions) {
  // PRISMA CODE (CŨ):
  // const updated = await prisma.$transaction(async (tx) => {
  //   await tx.quiz.update({ where: { id: quizId }, data: updateData });
  //   await tx.question.deleteMany({ where: { quizId } });
  //   for (const q of newQuestions) {
  //     await tx.question.create({ data: { ...q, quizId } });
  //   }
  //   return tx.quiz.findUnique({ where: { id: quizId }, include: { questions: true } });
  // });
  
  // MYSQL CODE (MỚI):
  await transaction(async (conn) => {
    const now = formatDateForMySQL();
    
    // Update quiz
    await conn.execute(
      'UPDATE Quiz SET title = ?, description = ?, published = ?, updatedAt = ? WHERE id = ?',
      [updateData.title, updateData.description, boolToInt(updateData.published), now, quizId]
    );
    
    // Delete old questions
    await conn.execute('DELETE FROM Question WHERE quizId = ?', [quizId]);
    
    // Create new questions
    for (const q of newQuestions) {
      const qId = generateCuid();
      await conn.execute(
        'INSERT INTO Question (id, quizId, question, type, options, correctAnswers, explanation, questionImage, optionImages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [qId, quizId, q.question, q.type, stringifyJSON(q.options), stringifyJSON(q.correctAnswers), q.explanation, q.questionImage, stringifyJSON(q.optionImages)]
      );
    }
  });
  
  // Fetch updated quiz
  const quiz = await queryOne('SELECT * FROM Quiz WHERE id = ?', [quizId]);
  quiz.questions = await query('SELECT * FROM Question WHERE quizId = ?', [quizId]);
  parseJSONFields(quiz.questions, ['options', 'correctAnswers', 'optionImages']);
  convertBoolFields(quiz, ['published']);
  
  return quiz;
}

// =============================================
// PATTERN 5: UPSERT
// =============================================

async function upsertPublicItem_PRISMA_STYLE(targetType, targetId) {
  // PRISMA CODE (CŨ):
  // await prisma.publicItem.upsert({
  //   where: { targetType_targetId: { targetType, targetId } },
  //   create: { targetType, targetId },
  //   update: {},
  // });
  
  // MYSQL CODE (MỚI):
  const id = generateCuid();
  const now = formatDateForMySQL();
  
  await query(
    `INSERT INTO PublicItem (id, targetType, targetId, createdAt) 
     VALUES (?, ?, ?, ?) 
     ON DUPLICATE KEY UPDATE targetType = targetType`,
    [id, targetType, targetId, now]
  );
}

// =============================================
// PATTERN 6: CONDITIONAL WHERE
// =============================================

async function getQuizzesWithAccessControl_PRISMA_STYLE(userId, classId, isOwner) {
  // PRISMA CODE (CŨ):
  // let whereClause = { classId };
  // if (!isOwner) {
  //   whereClause.published = true;
  // }
  // const quizzes = await prisma.quiz.findMany({ where: whereClause });
  
  // MYSQL CODE (MỚI):
  let sql = 'SELECT * FROM Quiz WHERE classId = ?';
  const params = [classId];
  
  if (!isOwner) {
    sql += ' AND published = 1';
  }
  
  const quizzes = await query(sql, params);
  convertBoolFields(quizzes, ['published']);
  
  return quizzes;
}

// =============================================
// PATTERN 7: AGGREGATE WITH COUNT
// =============================================

async function getQuizzesWithQuestionCount_PRISMA_STYLE(classId) {
  // PRISMA CODE (CŨ):
  // const quizzes = await prisma.quiz.findMany({
  //   where: { classId },
  //   select: {
  //     id: true,
  //     title: true,
  //     _count: { select: { questions: true } },
  //   }
  // });
  
  // MYSQL CODE (MỚI):
  const quizzes = await query(
    `SELECT q.id, q.title, q.description, q.published, 
            COUNT(qs.id) as questionCount
     FROM Quiz q
     LEFT JOIN Question qs ON qs.quizId = q.id
     WHERE q.classId = ?
     GROUP BY q.id`,
    [classId]
  );
  
  convertBoolFields(quizzes, ['published']);
  
  return quizzes;
}

// =============================================
// PATTERN 8: FIND WITH FALLBACK
// =============================================

async function getQuizByIdOrShortId_PRISMA_STYLE(id) {
  // PRISMA CODE (CŨ):
  // let quiz = await prisma.quiz.findUnique({ where: { id } });
  // if (!quiz) {
  //   const all = await prisma.quiz.findMany();
  //   quiz = all.find(q => buildShortId(q.id) === id);
  // }
  
  // MYSQL CODE (MỚI):
  let quiz = await queryOne('SELECT * FROM Quiz WHERE id = ?', [id]);
  
  if (!quiz) {
    // Try to match short ID
    const { buildShortId } = require('./share');
    const all = await query('SELECT * FROM Quiz', []);
    quiz = all.find(q => buildShortId(q.id) === id);
  }
  
  if (quiz) {
    convertBoolFields(quiz, ['published']);
    parseJSONFields(quiz, []);
  }
  
  return quiz;
}

// =============================================
// PATTERN 9: DELETE WITH CLEANUP
// =============================================

async function deleteQuizWithImages_PRISMA_STYLE(quizId) {
  // PRISMA CODE (CŨ):
  // const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: true } });
  // // Delete images...
  // await prisma.quiz.delete({ where: { id: quizId } });
  
  // MYSQL CODE (MỚI):
  const quiz = await queryOne('SELECT * FROM Quiz WHERE id = ?', [quizId]);
  if (!quiz) return null;
  
  const questions = await query('SELECT * FROM Question WHERE quizId = ?', [quizId]);
  parseJSONFields(questions, ['optionImages']);
  
  // Delete images (custom logic)
  const fs = require('fs');
  const path = require('path');
  for (const q of questions) {
    // Delete question image
    if (q.questionImage) {
      // ... delete file logic
    }
    // Delete option images
    if (q.optionImages) {
      // ... delete file logic
    }
  }
  
  // Delete quiz (cascade will delete questions)
  await query('DELETE FROM Quiz WHERE id = ?', [quizId]);
  
  return quiz;
}

// =============================================
// PATTERN 10: NESTED WHERE CONDITIONS
// =============================================

async function getSessionsWithQuizInfo_PRISMA_STYLE(userId) {
  // PRISMA CODE (CŨ):
  // const sessions = await prisma.quizSession.findMany({
  //   where: { userId },
  //   include: { quiz: { select: { title: true } } },
  //   orderBy: { completedAt: 'desc' }
  // });
  
  // MYSQL CODE (MỚI):
  const sessions = await query(
    `SELECT s.*, q.title as quizTitle
     FROM QuizSession s
     LEFT JOIN Quiz q ON q.id = s.quizId
     WHERE s.userId = ?
     ORDER BY s.completedAt DESC`,
    [userId]
  );
  
  parseJSONFields(sessions, ['answers']);
  
  return sessions;
}

module.exports = {
  // Export all patterns for reference
  getClassesWithQuizzes_PRISMA_STYLE,
  getPublicClasses_PRISMA_STYLE,
  createQuizWithQuestions_PRISMA_STYLE,
  updateQuizWithQuestions_PRISMA_STYLE,
  upsertPublicItem_PRISMA_STYLE,
  getQuizzesWithAccessControl_PRISMA_STYLE,
  getQuizzesWithQuestionCount_PRISMA_STYLE,
  getQuizByIdOrShortId_PRISMA_STYLE,
  deleteQuizWithImages_PRISMA_STYLE,
  getSessionsWithQuizInfo_PRISMA_STYLE,
};
