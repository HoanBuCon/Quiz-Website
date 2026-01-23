const express = require('express');
const { authRequired } = require('../middleware/auth');
const { query, queryOne, transaction } = require('../utils/db');
const { generateCuid, generateAccessCode, generateQuizAccessCode, formatDateForMySQL, buildWhereIn, boolToInt, intToBool } = require('../utils/helpers');
const router = express.Router();

// Toggle public listing for class/quiz
router.post('/public', authRequired, async (req, res) => {
  const { targetType, targetId, enabled } = req.body || {};
  if (!['class', 'quiz'].includes(targetType)) {
    return res.status(400).json({ message: 'Invalid targetType' });
  }
  if (!targetId) return res.status(400).json({ message: 'targetId required' });

  // Verify ownership
  let ownerId = null;
  if (targetType === 'class') {
    const cls = await queryOne('SELECT ownerId FROM Class WHERE id = ?', [targetId]);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    ownerId = cls.ownerId;
  } else {
    const qz = await queryOne('SELECT ownerId FROM Quiz WHERE id = ?', [targetId]);
    if (!qz) return res.status(404).json({ message: 'Quiz not found' });
    ownerId = qz.ownerId;
  }
  
  if (ownerId !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    if (targetType === 'class') {
      // ========== CLASS LOGIC ==========
      if (enabled) {
        // CASE 1: Class Private → Public (ALL quizzes become public)
        console.log('[CASE 1] Class Private → Public: Setting ALL Quizzes to Public');
        
        const now = formatDateForMySQL();
        
        await transaction(async (conn) => {
          // Set Class to Public
          await conn.execute(
            'UPDATE Class SET isPublic = ?, updatedAt = ? WHERE id = ?',
            [1, now, targetId]
          );
          
          // Upsert PublicItem for Class
          const [existing] = await conn.execute(
            'SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?',
            ['class', targetId]
          );
          
          if (!existing || existing.length === 0) {
            const publicItemId = generateCuid();
            await conn.execute(
              'INSERT INTO PublicItem (id, targetType, targetId, createdAt) VALUES (?, ?, ?, ?)',
              [publicItemId, 'class', targetId, now]
            );
          }
          
          // Get ALL quizzes in this class
          const [quizzes] = await conn.execute(
            'SELECT id FROM Quiz WHERE classId = ?',
            [targetId]
          );
          
          console.log(`Found ${quizzes.length} quizzes in class`);
          
          // Set ALL quizzes to Public
          for (const quiz of quizzes) {
            await conn.execute(
              'UPDATE Quiz SET published = ?, updatedAt = ? WHERE id = ?',
              [1, now, quiz.id]
            );
            
            const [qzExisting] = await conn.execute(
              'SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?',
              ['quiz', quiz.id]
            );
            
            if (!qzExisting || qzExisting.length === 0) {
              const qzPublicItemId = generateCuid();
              await conn.execute(
                'INSERT INTO PublicItem (id, targetType, targetId, createdAt) VALUES (?, ?, ?, ?)',
                [qzPublicItemId, 'quiz', quiz.id, now]
              );
            }
            
            console.log(`  Quiz ${quiz.id} → Public`);
          }
          
          console.log('[CASE 1] Complete: Class + ALL Quizzes are now Public');
        });
        
      } else {
        // CASE 3: Class Public → Private (only public quizzes become private)
        console.log('[CASE 3] Class Public → Private');
        
        const now = formatDateForMySQL();
        
        await transaction(async (conn) => {
          // Set Class to Private
          await conn.execute(
            'UPDATE Class SET isPublic = ?, updatedAt = ? WHERE id = ?',
            [0, now, targetId]
          );
          
          // Remove Class from PublicItem
          await conn.execute(
            'DELETE FROM PublicItem WHERE targetType = ? AND targetId = ?',
            ['class', targetId]
          );
          
          // Get ALL quizzes with their  published status
          const [quizzes] = await conn.execute(
            'SELECT id, published FROM Quiz WHERE classId = ?',
            [targetId]
          );
          
          console.log(`Found ${quizzes.length} quizzes in class`);
          
          // Only change PUBLIC quizzes to Private
          for (const quiz of quizzes) {
            if (intToBool(quiz.published)) {
              await conn.execute(
                'UPDATE Quiz SET published = ?, updatedAt = ? WHERE id = ?',
                [0, now, quiz.id]
              );
              
              await conn.execute(
                'DELETE FROM PublicItem WHERE targetType = ? AND targetId = ?',
                ['quiz', quiz.id]
              );
              
              console.log(`  Quiz ${quiz.id}: Public → Private`);
            } else {
              console.log(`  Quiz ${quiz.id}: Private → Keep Private`);
            }
          }
          
          console.log('[CASE 3] Complete');
        });
      }
      
    } else {
      // ========== QUIZ LOGIC ==========
      const quiz = await queryOne(
        'SELECT id, classId, published FROM Quiz WHERE id = ?',
        [targetId]
      );
      
      if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
      
      const cls = await queryOne(
        'SELECT id, isPublic FROM Class WHERE id = ?',
        [quiz.classId]
      );
      
      if (!cls) return res.status(404).json({ message: 'Class not found' });
      
      if (enabled) {
        // CASE 2: Quiz Private → Public (class becomes public)
        console.log('[CASE 2] Quiz Private → Public');
        
        const now = formatDateForMySQL();
        
        await transaction(async (conn) => {
          // If Class is Private, make it Public
          if (!intToBool(cls.isPublic)) {
            await conn.execute(
              'UPDATE Class SET isPublic = ?, updatedAt = ? WHERE id = ?',
              [1, now, quiz.classId]
            );
            
            const [clsExisting] = await conn.execute(
              'SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?',
              ['class', quiz.classId]
            );
            
            if (!clsExisting || clsExisting.length === 0) {
              const clsPublicItemId = generateCuid();
              await conn.execute(
                'INSERT INTO PublicItem (id, targetType, targetId, createdAt) VALUES (?, ?, ?, ?)',
                [clsPublicItemId, 'class', quiz.classId, now]
              );
            }
            
            console.log(`  Class ${quiz.classId}: Private → Public`);
          } else {
            console.log(`  Class ${quiz.classId}: Already Public`);
          }
          
          // Set THIS Quiz to Public
          await conn.execute(
            'UPDATE Quiz SET published = ?, updatedAt = ? WHERE id = ?',
            [1, now, targetId]
          );
          
          const [qzExisting] = await conn.execute(
            'SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?',
            ['quiz', targetId]
          );
          
          if (!qzExisting || qzExisting.length === 0) {
            const qzPublicItemId = generateCuid();
            await conn.execute(
              'INSERT INTO PublicItem (id, targetType, targetId, createdAt) VALUES (?, ?, ?, ?)',
              [qzPublicItemId, 'quiz', targetId, now]
            );
          }
          
          console.log(`  Quiz ${targetId}: Private → Public`);
          console.log('[CASE 2] Complete');
        });
        
      } else {
        // CASE 4: Quiz Public → Private (class stays public)
        console.log('[CASE 4] Quiz Public → Private');
        
        const now = formatDateForMySQL();
        
        await query(
          'UPDATE Quiz SET published = ?, updatedAt = ? WHERE id = ?',
          [0, now, targetId]
        );
        
        await query(
          'DELETE FROM PublicItem WHERE targetType = ? AND targetId = ?',
          ['quiz', targetId]
        );
        
        console.log(`  Quiz ${targetId}: Public → Private`);
        console.log(`  Class ${quiz.classId}: Stays Public`);
        console.log('[CASE 4] Complete');
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Public toggle error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle share (enable/disable) for class/quiz
router.post('/share', authRequired, async (req, res) => {
  const { targetType, targetId, enabled } = req.body || {};
  if (!['class', 'quiz'].includes(targetType)) {
    return res.status(400).json({ message: 'Invalid targetType' });
  }
  if (!targetId) return res.status(400).json({ message: 'targetId required' });

  // Verify ownership
  let ownerId = null;
  if (targetType === 'class') {
    const cls = await queryOne('SELECT ownerId FROM Class WHERE id = ?', [targetId]);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    ownerId = cls.ownerId;
  } else {
    const qz = await queryOne('SELECT ownerId FROM Quiz WHERE id = ?', [targetId]);
    if (!qz) return res.status(404).json({ message: 'Quiz not found' });
    ownerId = qz.ownerId;
  }
  
  if (ownerId !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    if (targetType === 'class') {
      // ========== CLASS SHARE LOGIC ==========
      if (enabled) {
        // CASE 1: Enable Share Class (all quizzes become shareable)
        console.log('[SHARE CASE 1] Enable Share Class');
        
        const now = formatDateForMySQL();
        
        await transaction(async (conn) => {
          // Upsert ShareItem for Class
          // Upsert ShareItem for Class
          const [existing] = await conn.execute(
            'SELECT id FROM ShareItem WHERE targetType = ? AND targetId = ?',
            ['class', targetId]
          );
          
          if (!existing || existing.length === 0) {
            const shareItemId = generateCuid();
            await conn.execute(
              'INSERT INTO ShareItem (id, targetType, targetId, ownerId, code, createdAt, isEnabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
              [shareItemId, 'class', targetId, req.user.id, generateAccessCode(), now]
            );
          } else {
             // Re-enable
             await conn.execute(
               'UPDATE ShareItem SET isEnabled = 1 WHERE id = ?',
               [existing[0].id]
             );
          }
          
          // Get ALL quizzes in this class
          const [quizzes] = await conn.execute(
            'SELECT id FROM Quiz WHERE classId = ?',
            [targetId]
          );
          
          console.log(`Found ${quizzes.length} quizzes in class`);
          
          // Create/Enable ShareItem for ALL quizzes
          for (const quiz of quizzes) {
            const [qzExisting] = await conn.execute(
              'SELECT id FROM ShareItem WHERE targetType = ? AND targetId = ?',
              ['quiz', quiz.id]
            );
            
            if (!qzExisting || qzExisting.length === 0) {
              const qzShareItemId = generateCuid();
              await conn.execute(
                'INSERT INTO ShareItem (id, targetType, targetId, ownerId, code, createdAt, isEnabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
                [qzShareItemId, 'quiz', quiz.id, req.user.id, generateAccessCode(), now]
              );
            } else {
               await conn.execute(
                 'UPDATE ShareItem SET isEnabled = 1 WHERE id = ?',
                 [qzExisting[0].id]
               );
            }
            
            console.log(`  Quiz ${quiz.id} → Shareable (Enabled)`);
          }
          
          console.log('[SHARE CASE 1] Complete');
        });
        
      } else {
        // CASE 3: Disable Share Class
        console.log('[SHARE CASE 3] Disable Share Class');
        
        await transaction(async (conn) => {
          // DO NOT Remove SharedAccess anymore - keep it for when sharing is re-enabled
          // await conn.execute(
          //   'DELETE FROM SharedAccess WHERE targetType = ? AND targetId = ?',
          //   ['class', targetId]
          // );
          console.log('  Preserved SharedAccess records for class');
          
          // Disable ShareItem for Class (Do not delete)
          await conn.execute(
            'UPDATE ShareItem SET isEnabled = 0 WHERE targetType = ? AND targetId = ?',
            ['class', targetId]
          );
          
          // Get ALL quizzes 
          const [quizzes] = await conn.execute(
            'SELECT id FROM Quiz WHERE classId = ?',
            [targetId]
          );
          
          console.log(`Found ${quizzes.length} quizzes in class`);
          
          // Disable ShareItem for shareable quizzes
          for (const quiz of quizzes) {
             await conn.execute(
                'UPDATE ShareItem SET isEnabled = 0 WHERE targetType = ? AND targetId = ?',
                ['quiz', quiz.id]
             );
             // DO NOT delete SharedAccess here either
          }
          
          console.log('[SHARE CASE 3] Complete');
        });
      }
      
    } else {
      // ========== QUIZ SHARE LOGIC ==========
      const quiz = await queryOne(
        'SELECT id, classId FROM Quiz WHERE id = ?',
        [targetId]
      );
      
      if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
      
      const classShareItem = await queryOne(
        'SELECT id FROM ShareItem WHERE targetType = ? AND targetId = ?',
        ['class', quiz.classId]
      );
      
      if (enabled) {
        // CASE 2: Enable Share Quiz (class becomes shareable)
        console.log('[SHARE CASE 2] Enable Share Quiz');
        
        const now = formatDateForMySQL();
        
        await transaction(async (conn) => {
          // If Class is Not Shareable, make it Shareable
          if (!classShareItem) {
            const clsShareItemId = generateCuid();
            await conn.execute(
              'INSERT INTO ShareItem (id, targetType, targetId, ownerId, code, createdAt, isEnabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
              [clsShareItemId, 'class', quiz.classId, req.user.id, generateAccessCode(), now]
            );
            console.log(`  Class ${quiz.classId}: Not Shareable → Shareable`);
          } else {
             // Ensure class is enabled
             await conn.execute(
                'UPDATE ShareItem SET isEnabled = 1 WHERE id = ?',
                [classShareItem.id]
             );
             console.log(`  Class ${quiz.classId}: Shareable (Enabled)`);
          }
          
          // Make THIS Quiz Shareable
          const [qzExisting] = await conn.execute(
            'SELECT id FROM ShareItem WHERE targetType = ? AND targetId = ?',
            ['quiz', targetId]
          );
          
          if (!qzExisting || qzExisting.length === 0) {
            const qzShareItemId = generateCuid();
            await conn.execute(
              'INSERT INTO ShareItem (id, targetType, targetId, ownerId, code, createdAt, isEnabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
              [qzShareItemId, 'quiz', targetId, req.user.id, generateQuizAccessCode(), now]
            );
          } else {
             await conn.execute(
                'UPDATE ShareItem SET isEnabled = 1 WHERE id = ?',
                [qzExisting[0].id]
             );
          }
          
          console.log(`  Quiz ${targetId}: Not Shareable → Shareable`);
          console.log('[SHARE CASE 2] Complete');
        });
        
      } else {
        // CASE 4: Disable Share Quiz
        console.log('[SHARE CASE 4] Disable Share Quiz');
        
        // DO NOT delete SharedAccess - preserve it
        // await query(
        //   'DELETE FROM SharedAccess WHERE targetType = ? AND targetId = ?',
        //   ['quiz', targetId]
        // );
        console.log(`  Preserved SharedAccess records for quiz ${targetId}`);
        
        // Disable ShareItem for THIS Quiz (Update isEnabled = 0)
        await query(
          'UPDATE ShareItem SET isEnabled = 0 WHERE targetType = ? AND targetId = ?',
          ['quiz', targetId]
        );
        
        console.log(`  Quiz ${targetId}: Shareable → Not Shareable (Disabled)`);
        console.log(`  Class ${quiz.classId}: Stays Shareable`);
        console.log('[SHARE CASE 4] Complete');
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Share toggle error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset share code (INVALIDATES OLD LINKS/CODES)
router.post('/share/reset', authRequired, async (req, res) => {
  const { targetType, targetId } = req.body || {};
  if (!['class', 'quiz'].includes(targetType)) {
    return res.status(400).json({ message: 'Invalid targetType' });
  }
  if (!targetId) return res.status(400).json({ message: 'targetId required' });

  // Verify ownership
  let ownerId = null;
  if (targetType === 'class') {
    const cls = await queryOne('SELECT ownerId FROM Class WHERE id = ?', [targetId]);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    ownerId = cls.ownerId;
  } else {
    const qz = await queryOne('SELECT ownerId FROM Quiz WHERE id = ?', [targetId]);
    if (!qz) return res.status(404).json({ message: 'Quiz not found' });
    ownerId = qz.ownerId;
  }
  
  if (ownerId !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const newCode = targetType === 'quiz' ? generateQuizAccessCode() : generateAccessCode();
    console.log(`Resetting share code for ${targetType} ${targetId} -> ${newCode}`);
    
    await transaction(async (conn) => {
      // NEW REQUIREMENT: If Reset Quiz -> Remove users from Class if they have no other quizzes
      if (targetType === 'quiz') {
         // 1. Get Class ID
         const [quiz] = await conn.execute('SELECT classId FROM Quiz WHERE id = ?', [targetId]);
         if (quiz && quiz.length > 0) {
             const classId = quiz[0].classId;
             
             // 2. Get users who currently have access to this quiz
             const [users] = await conn.execute(
                 'SELECT userId FROM SharedAccess WHERE targetType = "quiz" AND targetId = ?',
                 [targetId]
             );
             
             for (const u of users) {
                 const userId = u.userId;
                 
                 // 3. Check if user has access to OTHER quizzes in this class
                 // We don't count the current quiz because we are about to reset it (kick user out)
                 const [otherAccess] = await conn.execute(
                     `SELECT sa.id FROM SharedAccess sa
                      JOIN Quiz q ON sa.targetId = q.id
                      WHERE sa.userId = ? 
                      AND sa.targetType = 'quiz' 
                      AND q.classId = ? 
                      AND sa.targetId != ?`,
                     [userId, classId, targetId]
                 );
                 
                 if (!otherAccess || otherAccess.length === 0) {
                     // 4. User has NO other quiz access -> Check if they have navigationOnly class access
                     // If 'full', they joined via Class ID -> Don't touch
                     const [classAccess] = await conn.execute(
                         'SELECT id FROM SharedAccess WHERE userId = ? AND targetType = "class" AND targetId = ? AND accessLevel = "navigationOnly"',
                         [userId, classId]
                     );
                     
                     if (classAccess && classAccess.length > 0) {
                         // Remove Class Access (Clean cleanup)
                         await conn.execute(
                             'DELETE FROM SharedAccess WHERE id = ?',
                             [classAccess[0].id]
                         );
                         console.log(`Removed Class Access for user ${userId} (Clean cleanup after Quiz Reset)`);
                     }
                 }
             }
         }
      }

      // FIX BUG 1: Revoke ALL existing access sessions for this target
      // This ensures that users with the old code/link are kicked out
      await conn.execute(
        'DELETE FROM SharedAccess WHERE targetType = ? AND targetId = ?',
        [targetType, targetId]
      );

      // FIX BUG 2: Unban users when code is reset (Old bans are tied to old code)
      // Requirements:
      // - Reset Class ID -> Unban Class Bans AND All Quiz Bans in that Class
      // - Reset Quiz ID -> Unban Quiz Bans only
      if (targetType === 'class') {
         // 1. Unban Class
         await conn.execute(
            'DELETE FROM BannedAccess WHERE targetType = ? AND targetId = ?',
            ['class', targetId]
         );
         
         // 2. Unban All Quizzes in Class
         const [quizzes] = await conn.execute('SELECT id FROM Quiz WHERE classId = ?', [targetId]);
         if (quizzes.length > 0) {
             const qIds = quizzes.map(q => q.id);
             const { clause, params } = buildWhereIn(qIds);
             await conn.execute(
                 `DELETE FROM BannedAccess WHERE targetType = 'quiz' AND targetId ${clause}`,
                 params
             );

             // 3. Remove 'hidden' access for quizzes (Cleanup stale "deleted" states)
             await conn.execute(
                 `DELETE FROM SharedAccess WHERE targetType = 'quiz' AND accessLevel = 'hidden' AND targetId ${clause}`,
                 params
             );
         }
      } else {
         // 1. Unban Quiz
         await conn.execute(
            'DELETE FROM BannedAccess WHERE targetType = ? AND targetId = ?',
            ['quiz', targetId]
         );
      }
      
      // Update the code
      await conn.execute(
        'UPDATE ShareItem SET code = ? WHERE targetType = ? AND targetId = ?',
        [newCode, targetType, targetId]
      );
    });
    
    res.json({ ok: true, code: newCode });
  } catch (error) {
    console.error('Reset code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Claim access by id or share code
router.post('/claim', authRequired, async (req, res) => {
  const { classId, quizId, code } = req.body || {};

  let targetType = null;
  let targetId = null;

  if (code) {
    const share = await queryOne('SELECT targetType, targetId, code, isEnabled FROM ShareItem WHERE code = ?', [code]);
    if (!share || !intToBool(share.isEnabled)) return res.status(404).json({ message: 'Liên kết không tồn tại hoặc đã bị đóng' });
    targetType = share.targetType;
    targetId = share.targetId;

    // Check BAN status
    const banned = await queryOne(
      'SELECT id FROM BannedAccess WHERE userId = ? AND targetType = ? AND targetId = ? AND bannedCode = ?',
      [req.user.id, targetType, targetId, share.code]
    );

    if (banned) {
      return res.status(403).json({ message: 'Bạn đã bị chặn truy cập vào liên kết này' });
    }
  } else if (classId) {
    // ID-ONLY CLAIM -> Only allowed if PUBLIC
    const isPublic = await queryOne('SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?', ['class', classId]);
    if (!isPublic) {
      return res.status(403).json({ message: 'Mã truy cập là bắt buộc để tham gia lớp học này' });
    }
    
    targetType = 'class';
    targetId = classId;
  } else if (quizId) {
    // ID-ONLY CLAIM -> Only allowed if PUBLIC
    const isPublic = await queryOne('SELECT id FROM PublicItem WHERE targetType = ? AND targetId = ?', ['quiz', quizId]);
    if (!isPublic) {
      return res.status(403).json({ message: 'Mã truy cập là bắt buộc để tham gia Quiz này' });
    }
    
    targetType = 'quiz';
    targetId = quizId;
  } else {
    return res.status(400).json({ message: 'classId or quizId or code required' });
  }

  try {
    if (targetType === 'class') {
      // CLAIM CLASS → Grant FULL access to CLASS
      console.log(`[CLAIM CLASS] User ${req.user.id} claiming class ${targetId}`);
      
      const classShareItem = await queryOne(
        'SELECT id FROM ShareItem WHERE targetType = ? AND targetId = ?',
        ['class', targetId]
      );
      
      if (!classShareItem) {
        console.log(`[CLAIM CLASS] REJECTED: Class ${targetId} is not shareable`);
        return res.status(403).json({ message: 'Lớp học không được chia sẻ hoặc đã bị khóa chia sẻ' });
      }
      
      // Upsert SharedAccess for Class with FULL access
      const existing = await queryOne(
        'SELECT id FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
        [req.user.id, 'class', targetId]
      );
      
      const now = formatDateForMySQL();
      
      if (existing) {
        await query(
          'UPDATE SharedAccess SET accessLevel = ? WHERE id = ?',
          ['full', existing.id]
        );
      } else {
        const sharedAccessId = generateCuid();
        await query(
          'INSERT INTO SharedAccess (id, userId, targetType, targetId, accessLevel, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
          [sharedAccessId, req.user.id, 'class', targetId, 'full', now]
        );
      }
      
      console.log(`[CLAIM CLASS] Complete: User has FULL access to class`);

      // FIX: If user re-claims class, restore any quizzes they might have "deleted" (hidden)
      // We do this by removing the 'hidden' SharedAccess entries for quizzes in this class
      const classQuizzes = await query('SELECT id FROM Quiz WHERE classId = ?', [targetId]);
      if (classQuizzes.length > 0) {
        const qIds = classQuizzes.map(q => q.id);
        const { clause, params } = buildWhereIn(qIds);
        
        await query(
           `DELETE FROM SharedAccess WHERE userId = ? AND targetType = 'quiz' AND accessLevel = 'hidden' AND targetId ${clause}`,
           [req.user.id, ...params]
        );
        console.log(`[CLAIM CLASS] Restored ${classQuizzes.length} quizzes (if hidden)`);
      }
      
    } else {
      // CLAIM QUIZ → Grant navigationOnly to CLASS + full to THIS QUIZ
      console.log(`[CLAIM QUIZ] User ${req.user.id} claiming quiz ${targetId}`);
      
      const quizShareItem = await queryOne(
        'SELECT id FROM ShareItem WHERE targetType = ? AND targetId = ?',
        ['quiz', targetId]
      );
      
      if (!quizShareItem) {
        console.log(`[CLAIM QUIZ] REJECTED: Quiz ${targetId} is not shareable`);
        return res.status(403).json({ message: 'Quiz không được chia sẻ hoặc đã bị khóa chia sẻ' });
      }
      
      const quiz = await queryOne('SELECT classId FROM Quiz WHERE id = ?', [targetId]);
      if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
      
      // CHECK IF BANNED FROM CLASS
      const bannedFromClass = await queryOne(
        'SELECT id FROM BannedAccess WHERE userId = ? AND targetType = ? AND targetId = ? AND bannedCode = (SELECT code FROM ShareItem WHERE targetType = ? AND targetId = ?)',
        [req.user.id, 'class', quiz.classId, 'class', quiz.classId]
      );
      
      if (bannedFromClass) {
         console.log(`[CLAIM QUIZ] REJECTED: User banned from Class ${quiz.classId}`);
         return res.status(403).json({ message: 'Bạn đã bị chặn khỏi Lớp học này, không thể truy cập Quiz.' });
      }
      

      
      const now = formatDateForMySQL();
      
      await transaction(async (conn) => {
        // Upsert SharedAccess for CLASS with navigationOnly
        const [clsExisting] = await conn.execute(
          'SELECT id FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
          [req.user.id, 'class', quiz.classId]
        );
        
        if (clsExisting && clsExisting.length > 0) {
          await conn.execute(
            'UPDATE SharedAccess SET accessLevel = ? WHERE id = ?',
            ['navigationOnly', clsExisting[0].id]
          );
        } else {
          const clsSharedAccessId = generateCuid();
          await conn.execute(
            'INSERT INTO SharedAccess (id, userId, targetType, targetId, accessLevel, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [clsSharedAccessId, req.user.id, 'class', quiz.classId, 'navigationOnly', now]
          );
        }
        
        // Upsert SharedAccess for THIS QUIZ with full access
        const [qzExisting] = await conn.execute(
          'SELECT id FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
          [req.user.id, 'quiz', targetId]
        );
        
        if (qzExisting && qzExisting.length > 0) {
          await conn.execute(
            'UPDATE SharedAccess SET accessLevel = ? WHERE id = ?',
            ['full', qzExisting[0].id]
          );
        } else {
          const qzSharedAccessId = generateCuid();
          await conn.execute(
            'INSERT INTO SharedAccess (id, userId, targetType, targetId, accessLevel, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [qzSharedAccessId, req.user.id, 'quiz', targetId, 'full', now]
          );
        }
      });
      
      console.log(`[CLAIM QUIZ] Complete: navigationOnly for class + full for quiz`);
    }

    res.status(201).json({ targetType, targetId });
  } catch (error) {
    console.error('Claim error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove access for current user
router.delete('/access', authRequired, async (req, res) => {
  const { classId, quizId } = req.body || {};
  if (!classId && !quizId) {
    return res.status(400).json({ message: 'classId or quizId required' });
  }

  if (classId) {
    await query(
      'DELETE FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
      [req.user.id, 'class', classId]
    );
    return res.status(204).end();
  }

  if (quizId) {
    // FIX: Check if user has access via Class
    // If they have Class Access, simple DELETE won't work (quiz reappears via Class).
    // In that case, we mark it as "hidden"
    
    // 1. Get Quiz info to find Class
    const quiz = await queryOne('SELECT classId FROM Quiz WHERE id = ?', [quizId]);
    
    if (quiz) {
       const hasClassAccess = await queryOne(
         "SELECT id FROM SharedAccess WHERE userId = ? AND targetType = 'class' AND targetId = ?",
         [req.user.id, quiz.classId]
       );
       
       if (hasClassAccess) {
         // User has Class Access -> Soft Delete (Hide) the Quiz
         const { generateCuid, formatDateForMySQL } = require('../utils/helpers');
         
         const existing = await queryOne(
           "SELECT id FROM SharedAccess WHERE userId = ? AND targetType = 'quiz' AND targetId = ?",
           [req.user.id, quizId]
         );
         
         if (existing) {
            await query("UPDATE SharedAccess SET accessLevel = 'hidden' WHERE id = ?", [existing.id]);
         } else {
            await query(
               "INSERT INTO SharedAccess (id, userId, targetType, targetId, accessLevel, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
               [generateCuid(), req.user.id, 'quiz', quizId, 'hidden', formatDateForMySQL()]
            );
         }
         return res.status(204).end();
       }
    }
    
    // Standard Delete (No class access or class not found)
    const result = await query(
      'DELETE FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
      [req.user.id, 'quiz', quizId]
    );
    return res.status(204).end();
  }
});

// List public classes
router.get('/public/classes', authRequired, async (req, res) => {
  const pub = await query(
    'SELECT targetId FROM PublicItem WHERE targetType = ?',
    ['class']
  );
  const ids = pub.map(p => p.targetId);
  
  let classes = [];
  if (ids.length > 0) {
    const { clause, params } = buildWhereIn(ids);
    classes = await query(`SELECT * FROM Class WHERE id ${clause}`, params);
  }
  
  // Get quizzes for these classes
  if (classes.length > 0) {
    const classIds = classes.map(c => c.id);
    const { clause, params } = buildWhereIn(classIds);
    const quizzes = await query(`SELECT * FROM Quiz WHERE classId ${clause}`, params);
    
    // Attach quizzes to classes
    for (const cls of classes) {
      cls.quizzes = quizzes.filter(q => q.classId === cls.id);
    }
  }
  
  res.json(classes);
});

// List public quizzes
router.get('/public/quizzes', authRequired, async (req, res) => {
  const pub = await query(
    'SELECT targetId FROM PublicItem WHERE targetType = ?',
    ['quiz']
  );
  const ids = pub.map(p => p.targetId);
  
  let quizzes = [];
  if (ids.length > 0) {
    const { clause, params } = buildWhereIn(ids);
    quizzes = await query(`
      SELECT q.*, c.id as class_id, c.name as class_name, c.description as class_description, c.isPublic as class_isPublic
      FROM Quiz q
      JOIN Class c ON q.classId = c.id
      WHERE q.id ${clause}
    `, params);
    
    // Get questions for these quizzes
    if (quizzes.length > 0) {
      const quizIds = quizzes.map(q => q.id);
      const { clause: qClause, params: qParams } = buildWhereIn(quizIds);
      const questions = await query(`SELECT * FROM Question WHERE quizId ${qClause}`, qParams);
      
      // Attach questions and class to quizzes
      for (const quiz of quizzes) {
        quiz.questions = questions.filter(q => q.quizId === quiz.id);
        quiz.class = {
          id: quiz.class_id,
          name: quiz.class_name,
          description: quiz.class_description,
          isPublic: intToBool(quiz.class_isPublic)
        };
        // Clean up joined fields
        delete quiz.class_id;
        delete quiz.class_name;
        delete quiz.class_description;
        delete quiz.class_isPublic;
      }
    }
  }
  
  res.json(quizzes);
});

// List all shared classes
router.get('/shared/classes', authRequired, async (req, res) => {
  const shared = await query(
    'SELECT targetId FROM ShareItem WHERE targetType = ? AND isEnabled = 1',
    ['class']
  );
  const ids = shared.map(s => s.targetId);
  
  if (ids.length === 0) return res.json([]);
  
  const { clause, params } = buildWhereIn(ids);
  const classes = await query(`SELECT * FROM Class WHERE id ${clause}`, params);
  
  // Get quizzes for these classes
  if (classes.length > 0) {
    const classIds = classes.map(c => c.id);
    const { clause: qClause, params: qParams } = buildWhereIn(classIds);
    const quizzes = await query(`SELECT * FROM Quiz WHERE classId ${qClause}`, qParams);
    
    for (const cls of classes) {
      cls.quizzes = quizzes.filter(q => q.classId === cls.id);
    }
  }
  
  res.json(classes);
});

// List all shared quizzes
router.get('/shared/quizzes', authRequired, async (req, res) => {
  const shared = await query(
    'SELECT targetId FROM ShareItem WHERE targetType = ? AND isEnabled = 1',
    ['quiz']
  );
  const ids = shared.map(s => s.targetId);
  
  if (ids.length === 0) return res.json([]);
  
  const { clause, params } = buildWhereIn(ids);
  const quizzes = await query(`
    SELECT q.*, c.id as class_id, c.name as class_name, c.description as class_description, c.isPublic as class_isPublic
    FROM Quiz q
    JOIN Class c ON q.classId = c.id
    WHERE q.id ${clause}
  `, params);
  
  // Get questions for these quizzes
  if (quizzes.length > 0) {
    const quizIds = quizzes.map(q => q.id);
    const { clause: qClause, params: qParams } = buildWhereIn(quizIds);
    const questions = await query(`SELECT * FROM Question WHERE quizId ${qClause}`, qParams);
    
    for (const quiz of quizzes) {
      quiz.questions = questions.filter(q => q.quizId === quiz.id);
      quiz.class = {
        id: quiz.class_id,
        name: quiz.class_name,
        description: quiz.class_description,
        isPublic: intToBool(quiz.class_isPublic)
      };
      delete quiz.class_id;
      delete quiz.class_name;
      delete quiz.class_description;
      delete quiz.class_isPublic;
    }
  }
  
  res.json(quizzes);
});

// Check if class or quiz is shareable
router.get('/share/status', authRequired, async (req, res) => {
  const { targetType, targetId } = req.query;
  
  if (!['class', 'quiz'].includes(targetType)) {
    return res.status(400).json({ message: 'Invalid targetType' });
  }
  if (!targetId) {
    return res.status(400).json({ message: 'targetId required' });
  }

  const shareItem = await queryOne(
    'SELECT id, code, isEnabled FROM ShareItem WHERE targetType = ? AND targetId = ?',
    [targetType, targetId]
  );

  res.json({ 
    isShareable: !!shareItem && intToBool(shareItem.isEnabled),
    code: shareItem?.code || null
  });
});

// List users with access
router.get('/access/users', authRequired, async (req, res) => {
  const { targetType, targetId } = req.query;
  
  if (!['class', 'quiz'].includes(targetType)) {
    return res.status(400).json({ message: 'Invalid targetType' });
  }

  // Verify ownership
  let ownerId = null;
  if (targetType === 'class') {
    const cls = await queryOne('SELECT ownerId FROM Class WHERE id = ?', [targetId]);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    ownerId = cls.ownerId;
  } else {
    const qz = await queryOne('SELECT ownerId FROM Quiz WHERE id = ?', [targetId]);
    if (!qz) return res.status(404).json({ message: 'Quiz not found' });
    ownerId = qz.ownerId;
  }
  
  if (ownerId !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Get active SharedAccess users
  let activeQuery = '';
  let activeParams = [];

  if (targetType === 'class') {
    activeQuery = `
      SELECT DISTINCT sa.userId, u.name, u.email, u.avatarUrl
      FROM SharedAccess sa
      JOIN User u ON sa.userId = u.id
      WHERE sa.targetType = 'class' AND sa.targetId = ?
      AND NOT EXISTS (
        SELECT 1 FROM BannedAccess ba 
        WHERE ba.userId = sa.userId 
        AND ba.targetType = 'class' 
        AND ba.targetId = ?
        AND (
           ba.bannedCode = (SELECT code FROM ShareItem WHERE targetType = 'class' AND targetId = ?)
           OR NOT EXISTS (SELECT 1 FROM ShareItem WHERE targetType = 'class' AND targetId = ?)
        )
      )
    `;
    activeParams = [targetId, targetId, targetId, targetId];
  } else {
    // QUIZ: Include users with direct quiz access OR class access
    const quiz = await queryOne('SELECT classId FROM Quiz WHERE id = ?', [targetId]);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    const classId = quiz.classId;

    activeQuery = `
      SELECT DISTINCT u.id as userId, u.name, u.email, u.avatarUrl
      FROM User u
      JOIN SharedAccess sa ON sa.userId = u.id
      WHERE 
      (
        (sa.targetType = 'quiz' AND sa.targetId = ?)
        OR 
        (sa.targetType = 'class' AND sa.targetId = ?)
      )
      AND NOT EXISTS (
        SELECT 1 FROM BannedAccess ba 
        WHERE ba.userId = u.id 
        AND ba.targetType = 'quiz' 
        AND ba.targetId = ?
        AND ba.bannedCode = (SELECT code FROM ShareItem WHERE targetType = 'quiz' AND targetId = ?)
      )
    `;
    // Note: We only exclude if banned from QUIZ here, because if banned from CLASS they shouldn't even show up? 
    // Actually, if banned from CLASS, they effectively don't have access.
    // The query above filters access. If they are banned from class, they might still show up if they have direct quiz access?
    // Let's refine: A user is active if they have valid access.
    // Valid access = (Direct Quiz Access AND NOT Quiz Ban) OR (Class Access AND NOT Class Ban AND NOT Quiz Ban)
    // Simplify: Just show anyone who "could" access if not for THIS quiz ban.
    // But for "Ban" UI, we want to see people who HAVE access currently.
    
    // Correct Logic:
    // User is in list if:
    // 1. Has Quiz ShareAccess AND is NOT Banned from Quiz
    // 2. Has Class ShareAccess AND is NOT Banned from Class AND is NOT Banned from Quiz.
    
    activeQuery = `
      SELECT DISTINCT u.id as userId, u.name, u.email, u.avatarUrl
      FROM User u
      JOIN SharedAccess sa ON sa.userId = u.id
      WHERE 
        (
          (sa.targetType = 'quiz' AND sa.targetId = ? AND sa.accessLevel != 'hidden')
          OR
          (
            sa.targetType = 'class' AND sa.targetId = ? 
            AND sa.accessLevel = 'full'
            AND NOT EXISTS (
               SELECT 1 FROM BannedAccess ba_cls 
               WHERE ba_cls.userId = u.id 
               AND ba_cls.targetType = 'class' 
               AND ba_cls.targetId = ?
               AND (
                  ba_cls.bannedCode = (SELECT code FROM ShareItem WHERE targetType = 'class' AND targetId = ?)
                  OR NOT EXISTS (SELECT 1 FROM ShareItem WHERE targetType = 'class' AND targetId = ?)
               )
            )
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM BannedAccess ba_qz
          WHERE ba_qz.userId = u.id 
          AND ba_qz.targetType = 'quiz' 
          AND ba_qz.targetId = ?
          AND (
             ba_qz.bannedCode = (SELECT code FROM ShareItem WHERE targetType = 'quiz' AND targetId = ?)
             OR NOT EXISTS (SELECT 1 FROM ShareItem WHERE targetType = 'quiz' AND targetId = ?)
          )
        )
    `;
    activeParams = [targetId, classId, classId, classId, classId, targetId, targetId, targetId];
  }

  const activeUsers = await query(activeQuery, activeParams);

  // Get Banned users FOR CURRENT CODE
  const shareItem = await queryOne('SELECT code FROM ShareItem WHERE targetType = ? AND targetId = ?', [targetType, targetId]);
  const currentCode = shareItem?.code;

  let bannedUsers = [];
  if (targetType === 'class') {
    // Should verify if shareItem exists to filter by code, OR return all if share disabled
    const codeClause = currentCode ? "AND ba.bannedCode = ?" : "";
    const params = [targetId];
    if (currentCode) params.push(currentCode);
    
    bannedUsers = await query(`
        SELECT ba.*, u.name, u.email, u.id as userId, 'class' as source
        FROM BannedAccess ba
        JOIN User u ON ba.userId = u.id
        WHERE ba.targetType = 'class' AND ba.targetId = ? ${codeClause}
    `, params);
  } else {
    // For Quiz: Get bans from Quiz AND Class
    const quiz = await queryOne('SELECT classId FROM Quiz WHERE id = ?', [targetId]);
    if (quiz) {
         const classId = quiz.classId;
         // Get Class Share Code 
         const classShare = await queryOne('SELECT code FROM ShareItem WHERE targetType = "class" AND targetId = ?', [classId]);
         const classCode = classShare?.code;
         
         const qCodeClause = currentCode ? "AND ba.bannedCode = ?" : "";
         const cCodeClause = classCode ? "AND ba.bannedCode = ?" : "";
         
         // Build params
         let sqlParams = [targetId];
         if (currentCode) sqlParams.push(currentCode);
         sqlParams.push(classId);
         if (classCode) sqlParams.push(classCode);
         
         // UNION query
         let sql = `
            SELECT ba.*, u.name, u.email, u.id as userId, 'quiz' as source
            FROM BannedAccess ba
            JOIN User u ON ba.userId = u.id
            WHERE ba.targetType = 'quiz' AND ba.targetId = ? ${qCodeClause}
            
            UNION
            
            SELECT ba.*, u.name, u.email, u.id as userId, 'class' as source
            FROM BannedAccess ba
            JOIN User u ON ba.userId = u.id
            WHERE ba.targetType = 'class' AND ba.targetId = ? ${cCodeClause}
         `;
         
         bannedUsers = await query(sql, sqlParams);
    } else {
         // Fallback 
         const codeClause = currentCode ? "AND ba.bannedCode = ?" : "";
         const params = [targetId];
         if (currentCode) params.push(currentCode);

         bannedUsers = await query(`
            SELECT ba.*, u.name, u.email, u.id as userId, 'quiz' as source
            FROM BannedAccess ba
            JOIN User u ON ba.userId = u.id
            WHERE ba.targetType = 'quiz' AND ba.targetId = ? ${codeClause}
         `, params);
    }
  }

  res.json({
    active: activeUsers,
    banned: bannedUsers
  });
});

// Ban user
router.post('/access/ban', authRequired, async (req, res) => {
  const { targetType, targetId, userId } = req.body;
  if (!userId) return res.status(400).json({ message: 'userId required' });

  // Ownership check (reuse logic or refactor - sticking to inline for now)
  let ownerId = null;
  if (targetType === 'class') {
    const cls = await queryOne('SELECT ownerId FROM Class WHERE id = ?', [targetId]);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    ownerId = cls.ownerId;
  } else {
    const qz = await queryOne('SELECT ownerId FROM Quiz WHERE id = ?', [targetId]);
    if (!qz) return res.status(404).json({ message: 'Quiz not found' });
    ownerId = qz.ownerId;
  }
  
  if (ownerId !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

  // Get current code
  const shareItem = await queryOne('SELECT code FROM ShareItem WHERE targetType = ? AND targetId = ?', [targetType, targetId]);
  if (!shareItem || !shareItem.code) {
    return res.status(400).json({ message: 'Cannot ban: No active share code' });
  }

  const banId = generateCuid();
  try {
    // 1. Add to BannedAccess
    await query(
      'INSERT INTO BannedAccess (id, userId, targetType, targetId, bannedCode) VALUES (?, ?, ?, ?, ?)',
      [banId, userId, targetType, targetId, shareItem.code]
    );

    // 2. Remove from SharedAccess (Kick them out) -> FIX BUG 2: DO NOT DELETE SharedAccess
    // We want to keep the record so Unban restores it instantly.
    // Instead, access is blocked by middleware checking BannedAccess.
    /* 
    await query(
      'DELETE FROM SharedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
      [userId, targetType, targetId]
    ); 
    */

    res.json({ Ok: true });
  } catch (e) {
    console.error('Ban error:', e);
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'User already banned' });
    res.status(500).json({ message: 'Server error' });
  }
});

// Unban user
router.post('/access/unban', authRequired, async (req, res) => {
  const { targetType, targetId, userId } = req.body;
  
  // Ownership check
   let ownerId = null;
  if (targetType === 'class') {
    const cls = await queryOne('SELECT ownerId FROM Class WHERE id = ?', [targetId]);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    ownerId = cls.ownerId;
  } else {
    const qz = await queryOne('SELECT ownerId FROM Quiz WHERE id = ?', [targetId]);
    if (!qz) return res.status(404).json({ message: 'Quiz not found' });
    ownerId = qz.ownerId;
  }
  if (ownerId !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

  // STRICT HIERARCHY CHECK
  if (targetType === 'quiz') {
      // Check if user is banned from Class
      const quiz = await queryOne('SELECT classId FROM Quiz WHERE id = ?', [targetId]);
      if (quiz) {
         const classShare = await queryOne('SELECT code FROM ShareItem WHERE targetType = "class" AND targetId = ?', [quiz.classId]);
         if (classShare) {
            const classBan = await queryOne(
               'SELECT id FROM BannedAccess WHERE userId = ? AND targetType = "class" AND targetId = ? AND bannedCode = ?',
               [userId, quiz.classId, classShare.code]
            );
            
            if (classBan) {
               return res.status(403).json({ 
                 message: 'User đang bị chặn từ cấp Class. Vui lòng bỏ chặn tại Class.',
                 code: 'CLASS_LEVEL_BAN' 
               });
            }
         }
      }
  }

  // Remove from BannedAccess
  await query(
    'DELETE FROM BannedAccess WHERE userId = ? AND targetType = ? AND targetId = ?',
    [userId, targetType, targetId]
  );
  
  res.json({ ok: true });
});

module.exports = router;