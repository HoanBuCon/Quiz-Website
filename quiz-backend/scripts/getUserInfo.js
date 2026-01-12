// getUserInfo.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import fs from "fs";

// Load .env before importing db
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

// Import DB dynamically to pick up env vars
const { default: db } = await import("../utils/db.js");

const { query, queryOne, close } = db;
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log(`
=============================
 CHỌN CHỨC NĂNG LẤY NGƯỜI DÙNG
=============================
1. Tìm theo tên người dùng (name)
2. Tìm theo email
3. Hiển thị toàn bộ người dùng (dạng rút gọn)
4. Hiển thị toàn bộ người dùng (đầy đủ chi tiết)
5. Xuất toàn bộ người dùng ra file TXT (full)
6. Monitoring Online Users (Realtime - 2s update)
`);

rl.question("Nhập lựa chọn (1/2/3/4/5/6): ", async (choice) => {
  try {
    switch (choice.trim()) {
      case "1": {
        rl.question("Nhập tên người dùng (name): ", async (name) => {
          await getUserDetail({ name: name.trim() });
        });
        break;
      }

      case "2": {
        rl.question("Nhập email: ", async (email) => {
          await getUserDetail({ email: email.trim() });
        });
        break;
      }

      case "3": {
        const users = await query(`
          SELECT id, email, name, createdAt
          FROM User
        `);
        if (users.length === 0) {
          console.log("⚠️ Không có người dùng nào trong hệ thống.");
        } else {
          console.log(`✅ Danh sách ${users.length} người dùng:`);
          console.table(users);
        }
        rl.close();
        await close();
        break;
      }

      case "4": {
        const users = await query("SELECT * FROM User");

        if (users.length === 0) {
          console.log("⚠️ Không có người dùng nào trong hệ thống.");
        } else {
          console.log(
            `✅ Hiển thị toàn bộ ${users.length} người dùng (full):`
          );
          for (const baseUser of users) {
             const fullUser = await fetchFullUser(baseUser);
             await printFullUserInfo(fullUser);
             console.log("\n───────────────────────────────\n");
          }
        }

        rl.close();
        await close();
        break;
      }

      case "5": {
        const users = await query("SELECT * FROM User");

        if (users.length === 0) {
          console.log("⚠️ Không có người dùng nào trong hệ thống.");
        } else {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const dir = path.resolve("./user_info");
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

          const filePath = path.join(
            dir,
            `full_user_dump_${timestamp}.txt`
          );
          const output = [];

          output.push(
            `BÁO CÁO NGƯỜI DÙNG - ${new Date().toLocaleString()}`
          );
          output.push(
            "=====================================================\n"
          );

          for (const baseUser of users) {
            const fullUser = await fetchFullUser(baseUser);
            output.push(formatFullUserText(fullUser));
            output.push(
              "\n-----------------------------------------------------\n"
            );
          }

          fs.writeFileSync(filePath, output.join("\n"), "utf-8");
          console.log(
            `✅ Đã xuất toàn bộ người dùng vào file:\n📄 ${filePath}`
          );
        }

        rl.close();
        await close();
        break;
      }

      case "6": {
        console.log("\n📡 ĐANG THEO DÕI USER ONLINE (Update mỗi 2s) - Ấn Ctrl+C để dừng...");
        
        const checkOnline = async () => {
          try {
            // Lấy user hoạt động trong 5 phút gần nhất
            // Nếu có env ONLINE_WINDOW_MINUTES thì dùng, không thì default 5
            const onlineWindowMinutes = Number(process.env.ONLINE_WINDOW_MINUTES || 5);
            const timeThreshold = new Date(Date.now() - onlineWindowMinutes * 60 * 1000);
            
            const users = await query(
              "SELECT id, name, email, lastActivityAt FROM User WHERE lastActivityAt >= ? ORDER BY lastActivityAt DESC",
              [timeThreshold]
            );

            // Lấy thông tin Quiz đang làm (nếu có)
            const usersWithStatus = await Promise.all(users.map(async (u) => {
                // Tính trạng thái Active/Idle trước
                const diffSec = (Date.now() - new Date(u.lastActivityAt).getTime()) / 1000;
                let status = "🟡 Idle";
                if (diffSec < 60) status = "🟢 Active";
                
                // Chỉ hiển thị Quiz nếu user đang Active (xanh) HOẶC quiz mới bắt đầu < 5 phút
                // Điều này tránh hiển thị quiz bị treo khi user đã thoát nhưng k gọi api end
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                
                const activeAttempt = await queryOne(`
                    SELECT q.title, qa.startedAt, qa.quizId
                    FROM QuizAttempt qa
                    JOIN Quiz q ON qa.quizId = q.id
                    WHERE qa.userId = ? 
                      AND qa.endedAt IS NULL
                    ORDER BY qa.startedAt DESC
                    LIMIT 1
                `, [u.id]);
                
                let currentQuiz = null;
                if (activeAttempt) {
                    const startedAt = new Date(activeAttempt.startedAt);
                    const minutesSinceStart = Math.floor((Date.now() - startedAt.getTime()) / 60000);
                    const label = `${activeAttempt.title} (${minutesSinceStart}p)`;
                    
                    // Logic 1: Timeout (Zombie Check) - 4 giờ
                    if (minutesSinceStart > 240) {
                        currentQuiz = null; 
                    } 
                    // Logic 2: Check active status
                    else if (status !== "🟢 Active" && minutesSinceStart > 5) {
                        currentQuiz = null;
                    } 
                    else {
                        // Logic 3: Check Finished (Đã nộp bài nhưng Attempt chưa update status)
                        // Kiem tra trong bang QuizSession xem có bai nop nao sau khi attempt nay start khong
                        const finishedSession = await queryOne(`
                            SELECT id FROM QuizSession 
                            WHERE quizId = ? AND userId = ? AND startedAt >= ?
                            LIMIT 1
                        `, [activeAttempt.quizId, u.id, activeAttempt.startedAt]);
                        
                        if (finishedSession) {
                            currentQuiz = null; // Đã xong rồi -> Không còn đang làm
                        } else {
                            currentQuiz = label;
                        }
                    }
                }
                
                return {
                    ...u,
                    currentQuiz,
                    status
                };
            }));

            console.clear(); 
            console.log(`\n============== ${new Date().toLocaleTimeString()} (Window: ${onlineWindowMinutes}m) ==============`);
            console.log(`⚡ REAL-TIME MONITORING: ${users.length} users online`);
            
            if (users.length > 0) {
              console.table(usersWithStatus.map(u => ({
                ID: u.id,
                Name: u.name,
                Email: u.email,
                "Last Active": u.lastActivityAt ? new Date(u.lastActivityAt).toLocaleTimeString() : 'N/A',
                "Status": u.status,
                "Quiz": u.currentQuiz ? `📝 ${u.currentQuiz}` : "---"
              })));
            } else {
              console.log("... Không có ai đang online ...");
            }
            console.log("===============================================================");
            console.log("Tip: Nhấn Ctrl+C để thoát.");
          } catch (err) {
            console.error("Lỗi check online:", err);
          }
        };

        // Chạy ngay lần đầu
        await checkOnline();

        // Set interval 2s (Real-time feel)
        setInterval(checkOnline, 2000);
        
        // Không đóng connection và rl ở đây vì đang loop
        break;
      }

      default:
        console.log("❌ Lựa chọn không hợp lệ. Vui lòng chọn 1–6.");
        rl.close();
        await close();
        break;
    }
  } catch (error) {
    console.error("🚨 Lỗi khi truy vấn người dùng:", error);
    rl.close();
    await close();
  }
});

// =============================
// HÀM TRUY VẤN NGƯỜI DÙNG CHI TIẾT
// =============================

async function getUserDetail(whereClause) {
  try {
    // 1. Tìm user trước
    let sql = "SELECT * FROM User WHERE ";
    const params = [];
    if (whereClause.name) {
        sql += "name = ?";
        params.push(whereClause.name);
    } else if (whereClause.email) {
        sql += "email = ?";
        params.push(whereClause.email);
    }
    
    const user = await queryOne(sql, params);

    if (!user) {
      console.log("❌ Không tìm thấy người dùng nào.");
      rl.close();
      await close();
      return;
    }

    // 2. Lấy thông tin liên quan (populate)
    const fullUser = await fetchFullUser(user);

    // 3. In thông tin
    await printFullUserInfo(fullUser);

    rl.close();
    await close();
  } catch (error) {
    console.error("🚨 Lỗi khi lấy thông tin người dùng:", error);
    rl.close();
    await close();
  }
}

// ===================================
// HELPER: Fetch Relations Manually
// ===================================
async function fetchFullUser(user) {
  if (!user) return null;
  const userId = user.id;

  // 1. Classes
  const classes = await query("SELECT * FROM Class WHERE ownerId = ?", [userId]);
  // Fix tinyint boolean
  classes.forEach(c => c.isPublic = !!c.isPublic);

  // 2. Quizzes
  const quizzes = await query("SELECT * FROM Quiz WHERE ownerId = ?", [userId]);
  quizzes.forEach(q => q.published = !!q.published);

  // 3. Sessions (kèm tên quiz và tên lớp)
  // Prisma: include quiz { select id, title, class: { name } }
  const sessions = await query(`
    SELECT s.*, q.title as quizTitle, q.id as qId, c.name as classTitle
    FROM QuizSession s
    LEFT JOIN Quiz q ON s.quizId = q.id
    LEFT JOIN Class c ON q.classId = c.id
    WHERE s.userId = ?
  `, [userId]);
  
  // Format lại cấu trúc cho giống Prisma
  const formattedSessions = sessions.map(s => {
    // Tách quiz info ra
    const { quizTitle, qId, classTitle, ...rest } = s;
    return {
      ...rest,
      quiz: { id: qId, title: quizTitle, classTitle }
    };
  });

  // 4. QuizAttempts (kèm tên quiz và tên lớp, order desc)
  const attempts = await query(`
    SELECT a.*, q.title as quizTitle, q.id as qId, c.name as classTitle
    FROM QuizAttempt a
    LEFT JOIN Quiz q ON a.quizId = q.id
    LEFT JOIN Class c ON q.classId = c.id
    WHERE a.userId = ?
    ORDER BY a.startedAt DESC
  `, [userId]);

  const formattedAttempts = attempts.map(a => {
    const { quizTitle, qId, classTitle, ...rest } = a;
    return {
      ...rest,
      quiz: { id: qId, title: quizTitle, classTitle }
    };
  });

  return {
    ...user,
    classes,
    quizzes,
    sessions: formattedSessions,
    quizAttempts: formattedAttempts,
  };
}

// =============================
// HÀM IN THÔNG TIN NGƯỜI DÙNG RA CONSOLE
// =============================
async function printFullUserInfo(user) {
  console.log("\n===============================");
  console.log(`👤 NGƯỜI DÙNG: ${user.name || "(không có tên)"}`);
  console.log("===============================");
  console.log({
    ID: user.id,
    Email: user.email,
    Tên: user.name,
    Tạo_lúc: user.createdAt,
    Cập_nhật_lúc: user.updatedAt,
  });

  // === BỔ SUNG THÔNG TIN HOẠT ĐỘNG ===
  console.log("🕒 THÔNG TIN HOẠT ĐỘNG:");
  console.log({
    Login_gần_nhất: user.lastLoginAt?.toLocaleString() || "(chưa ghi nhận)",
    Logout_gần_nhất: user.lastLogoutAt?.toLocaleString() || "(chưa ghi nhận)",
    Hoạt_động_cuối: user.lastActivityAt?.toLocaleString() || "(chưa ghi nhận)",
  });
  // === KẾT THÚC BỔ SUNG ===

  // ===== LỚP HỌC =====
  console.log("\n📚 LỚP HỌC ĐÃ TẠO:");
  if (user.classes.length === 0) console.log("  (Không có lớp học nào)");
  else {
    console.table(
      user.classes.map((c) => ({
        ID: c.id,
        Tên: c.name,
        Công_khai: c.isPublic ? "✅" : "❌",
        Tạo_lúc: c.createdAt.toISOString(),
      }))
    );
  }

  // ===== QUIZ =====
  console.log("\n🧩 QUIZ ĐÃ TẠO:");
  if (user.quizzes.length === 0) console.log("  (Không có quiz nào)");
  else {
    console.table(
      user.quizzes.map((q) => ({
        ID: q.id,
        Tiêu_đề: q.title,
        Công_bố: q.published ? "✅" : "❌",
        Tạo_lúc: q.createdAt.toISOString(),
      }))
    );
  }

  // ===== THỐNG KÊ LÀM BÀI =====
  console.log("\n🧮 THỐNG KÊ LÀM BÀI (QuizSession):");
  if (user.sessions.length === 0) {
    console.log("  (Người dùng này chưa làm bài nào)");
  } else {
    const grouped = {};
    user.sessions.forEach((s) => {
      if (!grouped[s.quizId]) grouped[s.quizId] = [];
      grouped[s.quizId].push(s);
    });

    const stats = Object.entries(grouped).map(([quizId, sessions]) => {
      const quizName = sessions[0].quiz.title;
      const className = sessions[0].quiz.classTitle || "---"; // Lấy tên lớp
      const count = sessions.length;

      const avgPercent = (
        sessions.reduce(
          (sum, s) => sum + (s.score / s.totalQuestions) * 100,
          0
        ) / sessions.length
      ).toFixed(2);

      const totalTime = sessions.reduce((sum, s) => sum + s.timeSpent, 0);
      const times = sessions
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
        .map(
          (s, i) =>
            `#${i + 1} ${
              s.completedAt?.toLocaleString() || "?"
            } (${s.timeSpent}s) → ${(
              (s.score / s.totalQuestions) *
              100
            ).toFixed(2)}%`
        )
        .join("\n");

      return {
        Quiz_ID: quizId,
        Tiêu_đề: quizName,
        Tên_Lớp: className, // Thêm tên lớp vào bảng
        Số_lần_làm: count,
        "Điểm_tb(%)": `${avgPercent}%`,
        Tổng_thời_gian: `${totalTime}s`,
        Chi_tiết_từng_lần: `\n${times}`,
      };
    });

    console.table(stats);
  }

  // === BỔ SUNG LỊCH SỬ TRUY CẬP QUIZ ===
  console.log("\n🖱️ LỊCH SỬ TRUY CẬP QUIZ (QuizAttempt):");
  // Xử lý trường hợp user cũ không có dữ liệu quizAttempts
  if (!user.quizAttempts || user.quizAttempts.length === 0) {
    console.log("  (Chưa có lịch sử truy cập quiz nào được ghi nhận)");
  } else {
    console.table(
      user.quizAttempts.map((attempt) => ({
        Quiz_ID: attempt.quizId,
        Tiêu_đề: attempt.quiz.title,
        Tên_Lớp: attempt.quiz.classTitle || "---", // Thêm tên lớp vào bảng
        Vào_lúc: attempt.startedAt?.toLocaleString(),
        Thoát_lúc:
          attempt.endedAt?.toLocaleString() || "(chưa thoát/đang xem)",
        Đã_nộp_bài: attempt.quizSessionId ? "✅" : "❌",
      }))
    );
  }
  // === KẾT THÚC BỔ SUNG ===
}

// =============================
// HÀM XUẤT TEXT CHO FILE TXT
// =============================
function formatFullUserText(user) {
  let text = "";
  text += `👤 NGƯỜI DÙNG: ${user.name || "(không có tên)"}\n`;
  text += `ID: ${
    user.id
  }\nEmail: ${user.email}\nTạo lúc: ${user.createdAt}\nCập nhật lúc: ${user.updatedAt}\n`;

  // === BỔ SUNG THÔNG TIN HOẠT ĐỘNG ===
  text += `Login gần nhất: ${
    user.lastLoginAt?.toLocaleString() || "(chưa ghi nhận)"
  }\n`;
  text += `Logout gần nhất: ${
    user.lastLogoutAt?.toLocaleString() || "(chưa ghi nhận)"
  }\n\n`;
  // === KẾT THÚC BỔ SUNG ===

  text += "📚 LỚP HỌC:\n";
  if (user.classes.length === 0) text += "  (Không có lớp học nào)\n";
  else {
    for (const c of user.classes) {
      text += `  - ${c.name} [${c.id}] | Công khai: ${
        c.isPublic ? "✅" : "❌"
      } | ${c.createdAt.toISOString()}\n`;
    }
  }

  text += "\n🧩 QUIZ:\n";
  if (user.quizzes.length === 0) text += "  (Không có quiz nào)\n";
  else {
    for (const q of user.quizzes) {
      text += `  - ${q.title} [${q.id}] | Công bố: ${
        q.published ? "✅" : "❌"
      } | ${q.createdAt.toISOString()}\n`;
    }
  }

  text += "\n🧮 LỊCH SỬ LÀM BÀI:\n";
  if (user.sessions.length === 0) text += "  (Chưa làm bài nào)\n";
  else {
    const grouped = {};
    user.sessions.forEach((s) => {
      if (!grouped[s.quizId]) grouped[s.quizId] = [];
      grouped[s.quizId].push(s);
    });

    for (const [quizId, sessions] of Object.entries(grouped)) {
      const quizName = sessions[0].quiz.title;
      const className = sessions[0].quiz.classTitle || "---"; // Get class name
      const avgPercent = (
        sessions.reduce(
          (sum, s) => sum + (s.score / s.totalQuestions) * 100,
          0
        ) / sessions.length
      ).toFixed(2);
      const totalTime = sessions.reduce((sum, s) => sum + s.timeSpent, 0);
      
      text += `  • ${quizName} (Lớp: ${className}) [${quizId}]\n`; // Add class name to header
      text += `    → Số lần làm: ${sessions.length}, Trung bình: ${avgPercent}%, Tổng thời gian: ${totalTime}s\n`;
      sessions
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
        .forEach((s, i) => {
          const percent = ((s.score / s.totalQuestions) * 100).toFixed(2);
          text += `      #${i + 1} ${
            s.completedAt?.toLocaleString() || "?"
          } (${s.timeSpent}s) → ${percent}%\n`;
        });
      text += "\n";
    }
  }

  // === BỔ SUNG LỊCH SỬ TRUY CẬP QUIZ ===
  text += "\n🖱️ LỊCH SỬ TRUY CẬP QUIZ (QuizAttempt):\n";
  // Xử lý trường hợp user cũ không có dữ liệu quizAttempts
  if (!user.quizAttempts || user.quizAttempts.length === 0) {
    text += "  (Chưa có lịch sử truy cập quiz nào được ghi nhận)\n";
  } else {
    // Sắp xếp lại theo thời gian bắt đầu (nếu cần, vì truy vấn đã orderBy 'desc')
    const sortedAttempts = user.quizAttempts; // Đã sort bằng query

    for (const attempt of sortedAttempts) {
      const className = attempt.quiz.classTitle || "---";
      text += `  • ${attempt.quiz.title} (Lớp: ${className}) [${attempt.quizId}]\n`; // Add class name
      text += `    → Vào lúc: ${attempt.startedAt?.toLocaleString()}\n`;
      text += `    → Thoát lúc: ${
        attempt.endedAt?.toLocaleString() || "(chưa thoát/đang xem)"
      }\n`;
      text += `    → Đã nộp bài: ${attempt.quizSessionId ? "✅" : "❌"}\n\n`;
    }
  }
  // === KẾT THÚC BỔ SUNG ===

  return text;
}