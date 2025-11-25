const express = require('express');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

// Get quizzes by class
router.get('/by-class/:classId', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const classId = req.params.classId;

  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) return res.status(404).json({ message: 'Class not found' });

  const isOwner = cls.ownerId === req.user.id;
  const hasPublicItem = await prisma.publicItem.findFirst({ where: { targetType: 'class', targetId: classId } });
  const isPublic = !!cls.isPublic || !!hasPublicItem; // accept legacy flag OR new table
  const hasShared = await prisma.sharedAccess.findFirst({ where: { userId: req.user.id, targetType: 'class', targetId: classId } });
  
  // ===== LOGIC MỚI - accessLevel check =====
  // Allow access if:
  // 1. Owner
  // 2. Public class
  // 3. Has SharedAccess for class (any accessLevel, vì đây là list quizzes, không phải access quiz content)
  if (!isOwner && !isPublic && !hasShared) return res.status(403).json({ message: 'Forbidden' });

  // Only fetch minimal quiz metadata for listing; do NOT include questions for performance
  const quizzes = await prisma.quiz.findMany({
    where: { classId },
    select: {
      id: true,
      title: true,
      description: true,
      published: true,
      createdAt: true,
      updatedAt: true,
      ownerId: true,
      _count: { select: { questions: true } },
    }
  });

  const quizIds = quizzes.map(q => q.id);
  const shareItems = await prisma.shareItem.findMany({
    where: { 
      targetType: 'quiz',
      targetId: { in: quizIds }
    }
  });
  const sharedSet = new Set(shareItems.map(s => s.targetId));
  
  // ===== FILTER QUIZZES DỰA TRÊN QUYỀN TRUY CẬP =====
  let accessibleQuizzes = quizzes;
  
  if (!isOwner && !isPublic) {
    // User is accessing via SharedAccess - need to filter quizzes
    const classAccessLevel = hasShared?.accessLevel;
    
    if (classAccessLevel === 'full') {
      // User claimed CLASS → has full access to ALL quizzes
      accessibleQuizzes = quizzes;
    } else if (classAccessLevel === 'navigationOnly') {
      // User claimed individual QUIZzes → only show quizzes they have direct access to
      const userQuizAccess = await prisma.sharedAccess.findMany({
        where: {
          userId: req.user.id,
          targetType: 'quiz',
          targetId: { in: quizzes.map(q => q.id) }
        }
      });
      
      const accessibleQuizIds = new Set(userQuizAccess.map(a => a.targetId));
      accessibleQuizzes = quizzes.filter(q => accessibleQuizIds.has(q.id));
    }
  }
  
  // Map to lightweight payload with questionCount
  const payload = accessibleQuizzes.map(q => ({
    id: q.id,
    title: q.title,
    description: q.description,
    published: q.published,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    questionCount: q._count?.questions || 0,
    isShared: sharedSet.has(q.id)
  }));
  
  res.json(payload);
});

// Create quiz with questions (supports composite and drag)
router.post('/', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const { classId, title, description, published, questions } = req.body || {};
  if (!classId || !title) return res.status(400).json({ message: 'classId and title are required' });
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls || cls.ownerId !== req.user.id) return res.status(404).json({ message: 'Class not found' });

  const quiz = await prisma.quiz.create({
    data: {
      title,
      description,
      published: !!published,
      classId,
      ownerId: req.user.id,
    }
  });

  // Create questions (including composite children)
  const createOne = async (tx, q, parentId = null) => {
    const created = await tx.question.create({
      data: {
        quizId: quiz.id,
        parentId: parentId,
        question: q.question,
        type: q.type,
        options: q.options ? q.options : null,
        correctAnswers: q.correctAnswers || [],
        explanation: q.explanation || null,
        questionImage: q.questionImage || null,
        optionImages: q.optionImages || null,
      }
    });
    if (q.type === 'composite' && Array.isArray(q.subQuestions)) {
      for (const cq of q.subQuestions) {
        await createOne(tx, cq, created.id);
      }
    }
  };

  await prisma.$transaction(async (tx) => {
    for (const q of (questions || [])) {
      await createOne(tx, q, null);
    }
  });

  const withQuestions = await prisma.quiz.findUnique({ where: { id: quiz.id }, include: { questions: true } });
  res.status(201).json(withQuestions);
});

// Update quiz (and replace questions; supports composite and drag)
router.put('/:id', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;
  const found = await prisma.quiz.findUnique({ where: { id }, include: { questions: true } });
  if (!found || found.ownerId !== req.user.id) return res.status(404).json({ message: 'Not found' });
  const { title, description, published, questions } = req.body || {};
  const updated = await prisma.$transaction(async (tx) => {
    // Update quiz fields
    await tx.quiz.update({ where: { id }, data: { title, description, published } });

    // sync PublicItem when published provided
    if (typeof published === 'boolean') {
      if (published) {
        await tx.publicItem.upsert({
          where: { targetType_targetId: { targetType: 'quiz', targetId: id } },
          create: { targetType: 'quiz', targetId: id },
          update: {},
        });
      } else {
        await tx.publicItem.deleteMany({ where: { targetType: 'quiz', targetId: id } });
      }
    }

    if (Array.isArray(questions)) {
      // Replace questions: delete then recreate (including children)
      await tx.question.deleteMany({ where: { quizId: id } });
      const createOne = async (q, parentId = null) => {
        const created = await tx.question.create({
          data: {
            quizId: id,
            parentId,
            question: q.question,
            type: q.type,
            options: q.options ? q.options : null,
            correctAnswers: q.correctAnswers || [],
            explanation: q.explanation || null,
            questionImage: q.questionImage || null,
            optionImages: q.optionImages || null,
          }
        });
        if (q.type === 'composite' && Array.isArray(q.subQuestions)) {
          for (const cq of q.subQuestions) {
            await createOne(cq, created.id);
          }
        }
      };
      for (const q of questions) {
        await createOne(q, null);
      }
    }
    return tx.quiz.findUnique({ where: { id }, include: { questions: true } });
  });
  res.json(updated);
});

// Delete quiz
router.delete('/:id', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;
  const found = await prisma.quiz.findUnique({ where: { id }, include: { questions: true } });
  if (!found || found.ownerId !== req.user.id) return res.status(404).json({ message: 'Not found' });
  
  // ===== XÓA ẢNH TRƯỚC KHI XÓA QUIZ =====
  const fs = require('fs');
  const path = require('path');
  const isProd = process.env.NODE_ENV === 'production';
  const uploadDir = isProd 
    ? path.join(__dirname, '../../uploads/images')  // cPanel: public_html/uploads/images
    : path.join(__dirname, '../public/uploads/images');
  
  // Helper function: Xóa ảnh từ URL
  const deleteImageFromUrl = (imageUrl) => {
    if (!imageUrl || !imageUrl.includes('/uploads/images/')) return;
    
    try {
      // Lấy filename từ URL: http://localhost:4000/uploads/images/abc.png → abc.png
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
  
  // Xóa tất cả ảnh trong quiz
  for (const question of found.questions) {
    // Xóa ảnh câu hỏi
    if (question.questionImage) {
      deleteImageFromUrl(question.questionImage);
    }
    
    // Xóa ảnh options (nếu có)
    if (question.optionImages && typeof question.optionImages === 'object') {
      const optionImages = Array.isArray(question.optionImages) 
        ? question.optionImages 
        : Object.values(question.optionImages);
      
      for (const imgUrl of optionImages) {
        if (imgUrl) deleteImageFromUrl(imgUrl);
      }
    }
  }
  
  await prisma.quiz.delete({ where: { id } });
  res.status(204).end();
});

// Get quiz by ID or shortId (supports public/share) and return nested structure
router.get('/:id', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;
  try {
    let quiz = await prisma.quiz.findUnique({ where: { id }, include: { questions: true, class: true } });
    if (!quiz) {
      const { buildShortId } = require('../utils/share');
      const all = await prisma.quiz.findMany({ include: { questions: true, class: true } });
      quiz = all.find(q => buildShortId(q.id) === id);
    }
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const isOwner = quiz.ownerId === req.user.id;
    const quizPublic = await prisma.publicItem.findFirst({ where: { targetType: 'quiz', targetId: quiz.id } });
    const classPublic = await prisma.publicItem.findFirst({ where: { targetType: 'class', targetId: quiz.classId } });
    const hasQuizShared = await prisma.sharedAccess.findFirst({ where: { userId: req.user.id, targetType: 'quiz', targetId: quiz.id } });
    const hasClassShared = await prisma.sharedAccess.findFirst({ where: { userId: req.user.id, targetType: 'class', targetId: quiz.classId } });
    
    // Also check legacy isPublic flag on class
    const isClassPublicLegacy = quiz.class.isPublic;

    // ===== LOGIC MỚI - SỬ DỤNG accessLevel =====
    // Access rules:
    // 1. Owner always has access
    // 2. Quiz is public (via PublicItem or class public)
    // 3. User has direct quiz SharedAccess → access granted
    // 4. User has class SharedAccess với accessLevel='full' → access ALL quizzes
    // 5. User has class SharedAccess với accessLevel='navigationOnly' → NO access (chỉ để list class)
    const hasAccess = isOwner 
      || quizPublic 
      || classPublic 
      || isClassPublicLegacy 
      || hasQuizShared 
      || (hasClassShared && hasClassShared.accessLevel === 'full');  // ⭐ CHỈ full access mới được

    if (!hasAccess) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Build nested structure: parents first, attach children as subQuestions
    const allQs = quiz.questions;
    const byParent = new Map();
    for (const q of allQs) {
      const pid = q.parentId || null;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(q);
    }
    const roots = (byParent.get(null) || []).map(p => ({ ...p, subQuestions: (byParent.get(p.id) || []) }));

    const payload = { ...quiz, questions: roots };
    res.json(payload);
  } catch (e) {
    console.error('Error fetching quiz', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;

