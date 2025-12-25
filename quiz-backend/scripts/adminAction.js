import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

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
 CHỨC NĂNG QUẢN TRỊ HỆ THỐNG
=============================
1. Xóa tài khoản người dùng
2. Đổi tên người dùng
3. Xóa tin nhắn người dùng
4. Quản lý quiz và lớp học của người dùng
5. Quản lý nội dung Public (Class/Quiz)
`);

rl.question("Nhập lựa chọn (1/2/3/4/5): ", async (choice) => {
  try {
    switch (choice.trim()) {
      // ==================================================
      // 1. XÓA TÀI KHOẢN NGƯỜI DÙNG
      // ==================================================
      case "1": {
        rl.question("Nhập email hoặc username cần xóa: ", async (input) => {
          const user = await queryOne(
            "SELECT * FROM User WHERE email = ? OR name = ? LIMIT 1",
            [input.trim(), input.trim()]
          );

          if (!user) {
            console.log("❌ Không tìm thấy người dùng cần xóa.");
            rl.close();
            await close();
            return;
          }

          console.log(`⚠️ Bạn sắp xóa tài khoản: ${user.email || user.name}`);
          rl.question("Bạn có chắc muốn xóa? (yes/no): ", async (confirm) => {
            if (confirm.toLowerCase() === "yes") {
              // DB handles cascade normally
              await query("DELETE FROM User WHERE id = ?", [user.id]);
              console.log("✅ Đã xóa tài khoản và toàn bộ dữ liệu liên quan (theo cascade).");
            } else {
              console.log("❎ Đã hủy thao tác.");
            }
            rl.close();
            await close();
          });
        });
        break;
      }

      
      // ==================================================
      // 2. ĐỔI TÊN NGƯỜI DÙNG
      // ==================================================
      case "2": {
        rl.question("Nhập email hoặc username cần đổi tên: ", async (input) => {
          const user = await queryOne(
            "SELECT * FROM User WHERE email = ? OR name = ? LIMIT 1",
            [input.trim(), input.trim()]
          );

          if (!user) {
            console.log("❌ Không tìm thấy người dùng.");
            rl.close();
            await close();
            return;
          }

          console.log(`👤 Người dùng hiện tại: ${user.name} (${user.email})`);
          rl.question("Nhập tên hiển thị mới (để trống để hủy): ", async (newName) => {
            if (!newName.trim()) {
              console.log("❎ Đã hủy thao tác.");
              rl.close();
              await close();
              return;
            }

            await query("UPDATE User SET name = ? WHERE id = ?", [newName.trim(), user.id]);
            console.log(`✅ Đã đổi tên thành công thành: ${newName.trim()}`);
            rl.close();
            await close();
          });
        });
        break;
      }

      // ==================================================
      // 3. XÓA TIN NHẮN NGƯỜI DÙNG
      // ==================================================
      case "3": {
        rl.question("Nhập email hoặc username của người dùng cần xóa tin nhắn: ", async (input) => {
          const user = await queryOne(
            "SELECT * FROM User WHERE email = ? OR name = ? LIMIT 1",
            [input.trim(), input.trim()]
          );

          if (!user) {
            console.log("❌ Không tìm thấy người dùng này.");
            rl.close();
            await close();
            return;
          }

          console.log(`
=============================================
👤 Người dùng: ${user.name || "(không có tên)"} (${user.email})
=============================================
Bạn muốn làm gì?
a. Xóa 1 tin nhắn chỉ định
b. Xóa số lượng tin nhắn gần nhất
c. Xóa toàn bộ tin nhắn
=============================================
`);
          rl.question("Nhập lựa chọn (a/b/c): ", async (subChoice) => {
            switch (subChoice.trim().toLowerCase()) {
              case "a": {
                const messages = await query(
                  "SELECT * FROM ChatMessage WHERE userId = ? ORDER BY createdAt DESC LIMIT 20",
                  [user.id]
                );

                if (messages.length === 0) {
                  console.log("⚠️ Người dùng này chưa có tin nhắn nào.");
                  rl.close();
                  await close();
                  return;
                }

                console.log("\n🗨️ Các tin nhắn gần nhất:");
                messages.forEach((m, i) => {
                  console.log(
                    `${i + 1}. [${m.id}] ${new Date(m.createdAt).toLocaleString()} → ${m.content}`
                  );
                });

                rl.question("\nNhập ID tin nhắn cần xóa: ", async (msgId) => {
                  const msg = await queryOne(
                    "SELECT * FROM ChatMessage WHERE id = ?", 
                    [msgId.trim()]
                  );
                  if (!msg) {
                    console.log("❌ Không tìm thấy tin nhắn với ID này.");
                  } else {
                    await query("DELETE FROM ChatMessage WHERE id = ?", [msg.id]);
                    console.log("✅ Đã xóa tin nhắn.");
                  }
                  rl.close();
                  await close();
                });
                break;
              }

              case "b": {
                rl.question("Nhập số lượng tin nhắn gần nhất cần xóa: ", async (numStr) => {
                  const num = parseInt(numStr);
                  if (isNaN(num) || num <= 0) {
                    console.log("❌ Số lượng không hợp lệ.");
                    rl.close();
                    await close();
                    return;
                  }

                  const recentMessages = await query(
                    "SELECT id FROM ChatMessage WHERE userId = ? ORDER BY createdAt DESC LIMIT ?",
                    [user.id, num] // mysql2 usually handles number param for LIMIT
                  );
                  // Note: if mysql2/promise errs on string 'limit', make sure num is int (it is).

                  if (recentMessages.length === 0) {
                      console.log("⚠️ Không có tin nhắn nào để xóa."); // Should not happen if count > 0 logic ok, but safe
                      rl.close(); await close(); return;
                  }
                  
                  const ids = recentMessages.map((m) => m.id);
                  if (ids.length > 0) {
                      const placeholders = ids.map(() => '?').join(',');
                      const deleted = await query(
                          `DELETE FROM ChatMessage WHERE id IN (${placeholders})`,
                          ids
                      );
                      console.log(`✅ Đã xóa ${deleted.affectedRows} tin nhắn gần nhất của ${user.email || user.name}.`);
                  }

                  rl.close();
                  await close();
                });
                break;
              }

              case "c": {
                console.log("⚠️ Bạn sắp xóa toàn bộ tin nhắn của người dùng này.");
                rl.question("Bạn có chắc chắn không? (yes/no): ", async (confirm) => {
                  if (confirm.toLowerCase() === "yes") {
                    const deleted = await query(
                      "DELETE FROM ChatMessage WHERE userId = ?",
                      [user.id]
                    );
                    console.log(`✅ Đã xóa toàn bộ ${deleted.affectedRows} tin nhắn.`);
                  } else {
                    console.log("❎ Đã hủy thao tác.");
                  }
                  rl.close();
                  await close();
                });
                break;
              }

              default:
                console.log("❌ Lựa chọn không hợp lệ.");
                rl.close();
                await close();
                break;
            }
          });
        });
        break;
      }

      // ==================================================
      // 4. QUẢN LÝ QUIZ / CLASS CỦA NGƯỜI DÙNG
      // ==================================================
      case "4": {
        await handleUserQuizClass();
        break;
      }

      // ==================================================
      // 5. QUẢN LÝ NỘI DUNG PUBLIC (CLASS / QUIZ)
      // ==================================================
      case "5": {
        await handlePublicContent();
        break;
      }

      default:
        console.log("❌ Lựa chọn không hợp lệ. Vui lòng chọn 1, 2, 3, 4 hoặc 5.");
        rl.close();
        await close();
        break;
    }
  } catch (error) {
    console.error("🚨 Lỗi trong quá trình xử lý:", error);
    rl.close();
    await close();
  }
});

// ==================================================
// HÀM CON: QUẢN LÝ QUIZ / CLASS VỚI FALLBACK
// ==================================================
async function handleUserQuizClass() {
  rl.question("Nhập email hoặc username của người dùng: ", async (input) => {
    // Fetch user
    const user = await queryOne(
        "SELECT * FROM User WHERE email = ? OR name = ? LIMIT 1",
        [input.trim(), input.trim()]
    );

    if (!user) {
      console.log("❌ Không tìm thấy người dùng này. Vui lòng nhập lại.\n");
      return handleUserQuizClass();
    }

    // Fetch Classes
    const classes = await query("SELECT * FROM Class WHERE ownerId = ?", [user.id]);
    classes.forEach(c => c.isPublic = !!c.isPublic); // fix bool

    // Fetch Quizzes
    const quizzes = await query("SELECT * FROM Quiz WHERE ownerId = ?", [user.id]);
    quizzes.forEach(q => q.published = !!q.published); // fix bool

    user.classes = classes;
    user.quizzes = quizzes;

    console.log(`\n👤 Người dùng: ${user.name || "(không có tên)"} (${user.email})`);
    console.log("=============================================");

    const hasClasses = user.classes.length > 0;
    const hasQuizzes = user.quizzes.length > 0;

    if (!hasClasses && !hasQuizzes) {
      console.log("\n⚠️ Người dùng này chưa tạo lớp học hoặc quiz nào.");
      console.log("🔁 Vui lòng nhập người dùng khác.\n");
      return handleUserQuizClass();
    }

    if (hasClasses) {
      console.log("\n📚 LỚP HỌC ĐÃ TẠO:");
      console.table(
        user.classes.map((c) => ({
          ID: c.id,
          Tên: c.name,
          Công_khai: c.isPublic ? "✅" : "❌",
          Chia_sẻ: c.shareCode ? "🔗 Có" : "❌ Không",
          Tạo_lúc: new Date(c.createdAt).toLocaleString(),
        }))
      );
    }

    if (hasQuizzes) {
      console.log("\n🧩 QUIZ ĐÃ TẠO:");
      console.table(
        user.quizzes.map((q) => ({
          ID: q.id,
          Tiêu_đề: q.title,
          Công_bố: q.published ? "✅" : "❌",
          Chia_sẻ: q.shareCode ? "🔗 Có" : "❌ Không",
          Tạo_lúc: new Date(q.createdAt).toLocaleString(),
        }))
      );
    }

    console.log(`
=============================================
Bạn muốn làm gì?
a. Xóa 1 lớp học theo ID
b. Xóa 1 quiz theo ID
c. Xóa toàn bộ lớp học và quiz của người dùng này
=============================================
`);

    rl.question("Nhập lựa chọn (a/b/c): ", async (subChoice) => {
      switch (subChoice.trim().toLowerCase()) {
        case "a": {
          rl.question("Nhập ID lớp học cần xóa: ", async (classId) => {
            const cls = await queryOne("SELECT * FROM Class WHERE id = ?", [classId.trim()]);
            if (!cls) console.log("❌ Không tìm thấy lớp học với ID đó.");
            else {
              await query("DELETE FROM Class WHERE id = ?", [cls.id]);
              console.log(`✅ Đã xóa lớp học "${cls.name}".`);
            }
            rl.close();
            await close();
          });
          break;
        }

        case "b": {
          rl.question("Nhập ID quiz cần xóa: ", async (quizId) => {
            const quiz = await queryOne("SELECT * FROM Quiz WHERE id = ?", [quizId.trim()]);
            if (!quiz) console.log("❌ Không tìm thấy quiz với ID đó.");
            else {
              await query("DELETE FROM Quiz WHERE id = ?", [quiz.id]);
              console.log(`✅ Đã xóa quiz "${quiz.title}".`);
            }
            rl.close();
            await close();
          });
          break;
        }

        case "c": {
          console.log("⚠️ Bạn sắp xóa toàn bộ lớp học và quiz của người dùng này.");
          rl.question("Bạn có chắc chắn không? (yes/no): ", async (confirm) => {
            if (confirm.toLowerCase() === "yes") {
              const deletedClasses = await query("DELETE FROM Class WHERE ownerId = ?", [user.id]);
              const deletedQuizzes = await query("DELETE FROM Quiz WHERE ownerId = ?", [user.id]);
              console.log(`✅ Đã xóa ${deletedClasses.affectedRows} lớp học và ${deletedQuizzes.affectedRows} quiz.`);
            } else {
              console.log("❎ Đã hủy thao tác.");
            }
            rl.close();
            await close();
          });
          break;
        }

        default:
          console.log("❌ Lựa chọn không hợp lệ.");
          rl.close();
          await close();
          break;
      }
    });
  });
}

// ==================================================
// HÀM CON: QUẢN LÝ NỘI DUNG PUBLIC (CLASS / QUIZ)
// ==================================================
async function handlePublicContent() {
  console.log("\n🔄 Đang tải danh sách các Class và Quiz đang công khai...");

  // 1. Lấy danh sách Class public
  // Need owner info
  const publicClasses = await query(`
    SELECT c.*, u.email as owner_email 
    FROM Class c 
    LEFT JOIN User u ON c.ownerId = u.id
    WHERE c.isPublic = 1 
    ORDER BY c.createdAt DESC
  `); 
  
  // 2. Lấy danh sách Quiz published
  const publicQuizzes = await query(`
    SELECT q.*, u.email as owner_email
    FROM Quiz q
    LEFT JOIN User u ON q.ownerId = u.id
    WHERE q.published = 1
    ORDER BY q.createdAt DESC
  `);

  const hasClasses = publicClasses.length > 0;
  const hasQuizzes = publicQuizzes.length > 0;

  if (!hasClasses && !hasQuizzes) {
    console.log("✅ Hiện tại không có Class hay Quiz nào đang công khai.");
    rl.close();
    await close();
    return;
  }

  // Hiển thị bảng Class Public
  if (hasClasses) {
    console.log(`\n📚 CLASS ĐANG PUBLIC (${publicClasses.length}):`);
    console.table(
      publicClasses.map((c) => ({
        ID: c.id,
        Tên_Lớp: c.name.substring(0, 30) + (c.name.length > 30 ? "..." : ""),
        Người_tạo: c.owner_email,
        Ngày_tạo: new Date(c.createdAt).toLocaleDateString(),
      }))
    );
  }

  // Hiển thị bảng Quiz Public
  if (hasQuizzes) {
    console.log(`\n🧩 QUIZ ĐANG PUBLIC (${publicQuizzes.length}):`);
    console.table(
      publicQuizzes.map((q) => ({
        ID: q.id,
        Tiêu_đề: q.title.substring(0, 30) + (q.title.length > 30 ? "..." : ""),
        Người_tạo: q.owner_email,
        Ngày_tạo: new Date(q.createdAt).toLocaleDateString(),
      }))
    );
  }

  console.log(`
=============================================
Bạn muốn làm gì?
a. Đặt Private cho 1 Class (theo ID)
b. Đặt Private cho 1 Quiz (theo ID)
c. Thoát
=============================================
`);

  rl.question("Nhập lựa chọn (a/b/c): ", async (subChoice) => {
    switch (subChoice.trim().toLowerCase()) {
      case "a": {
        if (!hasClasses) {
          console.log("❌ Không có Class nào để xử lý.");
          rl.close(); await close(); return;
        }
        rl.question("Nhập ID của Class cần ẩn (Private): ", async (classId) => {
          const cls = await queryOne("SELECT * FROM Class WHERE id = ?", [classId.trim()]);
          
          if (!cls) {
            console.log("❌ Không tìm thấy Class với ID này.");
          } else {
            console.log(`⏳ Đang xử lý class "${cls.name}" và các quiz bên trong...`);

            // 1. Cập nhật bảng Class (Set Private)
            await query("UPDATE Class SET isPublic = 0 WHERE id = ?", [cls.id]);

            // 2. Xóa Class khỏi bảng PublicItem
            await query("DELETE FROM PublicItem WHERE targetType = 'class' AND targetId = ?", [cls.id]);

            // =========================================================
            // XỬ LÝ CASCADE: ẨN TOÀN BỘ QUIZ TRONG CLASS
            // =========================================================
            
            // Lấy danh sách ID các quiz trong class này
            const quizzesInClass = await query("SELECT id FROM Quiz WHERE classId = ?", [cls.id]);
            const quizIds = quizzesInClass.map(q => q.id);

            if (quizIds.length > 0) {
              // 3. Set published = false cho tất cả quiz trong class
              const updateResult = await query("UPDATE Quiz SET published = 0 WHERE classId = ?", [cls.id]);

              // 4. Xóa các quiz này khỏi bảng PublicItem (nếu có)
              const placeholders = quizIds.map(() => '?').join(',');
              const deletePublicItemsResult = await query(
                  `DELETE FROM PublicItem WHERE targetType = 'quiz' AND targetId IN (${placeholders})`,
                  quizIds
              );

              console.log(`   ↳ Đã ẩn thêm ${updateResult.affectedRows} quiz thuộc class này.`);
              console.log(`   ↳ Đã gỡ ${deletePublicItemsResult.affectedRows} quiz khỏi trang Public.`);
            } else {
              console.log("   ↳ Class này không chứa quiz nào.");
            }

            console.log(`✅ Hoàn tất! Class "${cls.name}" và toàn bộ nội dung bên trong đã chuyển sang Private.`);
          }
          rl.close();
          await close();
        });
        break;
      }

      case "b": {
        if (!hasQuizzes) {
          console.log("❌ Không có Quiz nào để xử lý.");
          rl.close(); await close(); return;
        }
        rl.question("Nhập ID của Quiz cần ẩn (Unpublish): ", async (quizId) => {
          const quiz = await queryOne("SELECT * FROM Quiz WHERE id = ?", [quizId.trim()]);

          if (!quiz) {
            console.log("❌ Không tìm thấy Quiz với ID này.");
          } else {
            // 1. Cập nhật bảng Quiz
            await query("UPDATE Quiz SET published = 0 WHERE id = ?", [quiz.id]);

            // 2. Xóa khỏi bảng PublicItem (Quan trọng để ẩn trên web)
            await query("DELETE FROM PublicItem WHERE targetType = 'quiz' AND targetId = ?", [quiz.id]);

            console.log(`✅ Đã chuyển Quiz "${quiz.title}" sang trạng thái Private và xóa khỏi PublicItem.`);
          }
          rl.close();
          await close();
        });
        break;
      }

      case "c":
      default:
        console.log("👋 Kết thúc thao tác.");
        rl.close();
        await close();
        break;
    }
  });
}