const express = require('express');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

// List classes: mine (owned + shared) or public (from PublicItem)
router.get('/', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const mine = req.query.mine === 'true';

  // --- GIỮ NGUYÊN PHẦN XỬ LÝ 'MINE' (NẾU CÓ) ---
  if (mine) {
    // ... (code cũ của phần mine) ...
    // Lưu ý: Nếu phần mine của bạn chưa có logic lấy isShared, bạn cũng nên thêm vào tương tự bên dưới
    // Nhưng quan trọng nhất là phần Public bên dưới đây:
    const owned = await prisma.class.findMany({ where: { ownerId: req.user.id }, include: { quizzes: true } });
    const sharedAccess = await prisma.sharedAccess.findMany({ where: { userId: req.user.id, targetType: 'class' } });
    const sharedIds = sharedAccess.map(s => s.targetId);
    const shared = sharedIds.length > 0
      ? await prisma.class.findMany({ where: { id: { in: sharedIds } }, include: { quizzes: true } })
      : [];

    // Lấy thông tin ShareItem cho các lớp mình sở hữu để biết lớp nào đang bật Share
    const ownedIds = owned.map(c => c.id);
    const shareItems = await prisma.shareItem.findMany({
      where: { targetType: 'class', targetId: { in: ownedIds } }
    });
    const shareMap = new Set(shareItems.map(s => s.targetId));

    const withFlags = [
      ...owned.map(c => ({ 
          ...c, 
          accessType: 'owner',
          isShared: shareMap.has(c.id) // <--- CỜ QUAN TRỌNG
      })),
      ...shared.map(c => ({ ...c, accessType: 'shared', isShared: true })),
    ];
    return res.json(withFlags);
  }

  // --- SỬA PHẦN LẤY LIST PUBLIC ---
  
  // 1. Lấy danh sách Public (như cũ)
  const pub = await prisma.publicItem.findMany({ where: { targetType: 'class' } });
  const ids = pub.map(p => p.targetId);
  const classes = await prisma.class.findMany({
    where: {
      OR: [
        { id: { in: ids } },
        { isPublic: true },
      ]
    },
    include: { quizzes: true }
  });

  // 2. [MỚI] Lấy danh sách các lớp đang được Share (có code)
  const shareItems = await prisma.shareItem.findMany({
    where: { targetType: 'class' }
  });

  // 3. Map dữ liệu để thêm cờ isShared
  const withPublic = classes.map(c => {
    const shareInfo = shareItems.find(s => s.targetId === c.id);
    return { 
        ...c, 
        isPublic: true, 
        accessType: 'public',
        isShared: !!shareInfo,       // <--- Backend báo cho Frontend biết: Lớp này đang Share
        shareCode: shareInfo?.code   // <--- Gửi kèm mã share
    };
  });

  res.json(withPublic);
});

// Create class
router.post('/', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const { name, description, isPublic } = req.body || {};
  if (!name) return res.status(400).json({ message: 'Name is required' });
  const cls = await prisma.class.create({ data: { name, description, isPublic: !!isPublic, ownerId: req.user.id } });
  res.status(201).json(cls);
});

// Update class
router.put('/:id', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;
  const found = await prisma.class.findUnique({ where: { id } });
  if (!found || found.ownerId !== req.user.id) return res.status(404).json({ message: 'Not found' });
  const { name, description, isPublic } = req.body || {};
  const cls = await prisma.class.update({ where: { id }, data: { name, description, isPublic } });

  // sync PublicItem when isPublic provided
  if (typeof isPublic === 'boolean') {
    if (isPublic) {
      await prisma.publicItem.upsert({
        where: { targetType_targetId: { targetType: 'class', targetId: id } },
        create: { targetType: 'class', targetId: id },
        update: {},
      });
    } else {
      await prisma.publicItem.deleteMany({ where: { targetType: 'class', targetId: id } });
    }
  }

  res.json(cls);
});

// Delete class (cascades to quizzes/questions)
router.delete('/:id', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;
  const found = await prisma.class.findUnique({ where: { id } });
  if (!found || found.ownerId !== req.user.id) return res.status(404).json({ message: 'Not found' });
  await prisma.class.delete({ where: { id } });
  res.status(204).end();
});

// Import a public class or a quiz by id (clone into current user's space)
router.post('/import', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const { classId, quizId } = req.body || {};
  if (!classId && !quizId) return res.status(400).json({ message: 'classId or quizId required' });

  // Helper to clone quiz with questions into target class
  const cloneQuiz = async (sourceQuizId, targetClassId, ownerId) => {
    const q = await prisma.quiz.findUnique({ where: { id: sourceQuizId }, include: { questions: true, class: true } });
    if (!q) throw new Error('Quiz not found');
    if (!q.class.isPublic && q.ownerId !== ownerId) throw new Error('Forbidden');
    const created = await prisma.quiz.create({
      data: {
        title: q.title,
        description: q.description,
        published: false,
        classId: targetClassId,
        ownerId,
        questions: {
          create: q.questions.map(qq => ({
            question: qq.question,
            type: qq.type,
            options: qq.options,
            correctAnswers: qq.correctAnswers,
            explanation: qq.explanation,
            questionImage: qq.questionImage,
            optionImages: qq.optionImages,
          }))
        }
      }, include: { questions: true }
    });
    return created;
  };

  if (classId) {
    const source = await prisma.class.findUnique({ where: { id: classId }, include: { quizzes: { include: { questions: true } } } });
    if (!source) return res.status(404).json({ message: 'Class not found' });
    if (!source.isPublic && source.ownerId !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
    const newClass = await prisma.class.create({ data: { name: source.name, description: source.description, isPublic: false, ownerId: req.user.id } });
    for (const q of source.quizzes) {
      await cloneQuiz(q.id, newClass.id, req.user.id);
    }
    return res.status(201).json({ classId: newClass.id });
  }

  if (quizId) {
    const q = await prisma.quiz.findUnique({ where: { id: quizId }, include: { class: true, questions: true } });
    if (!q) return res.status(404).json({ message: 'Quiz not found' });
    if (!q.class.isPublic && q.ownerId !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
    const newClass = await prisma.class.create({ data: { name: `Lớp: ${q.class.name}`, description: q.class.description, isPublic: false, ownerId: req.user.id } });
    const newQuiz = await cloneQuiz(q.id, newClass.id, req.user.id);
    return res.status(201).json({ classId: newClass.id, quizId: newQuiz.id });
  }
});

module.exports = router;

