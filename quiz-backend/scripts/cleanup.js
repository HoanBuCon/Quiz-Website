const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { query, queryOne } = require('../utils/db');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const cleanup = async () => {
    try {
        console.log("🔍 Đang tìm các QuizAttempt bị treo (chưa có endedAt)...");
        
        // 1. Đếm số lượng attempt bị treo
        // Điều kiện: endedAt IS NULL
        // Có thể thêm điều kiện thời gian, ví dụ treo quá 24h
        
        const countResult = await queryOne(`
            SELECT COUNT(*) as count 
            FROM QuizAttempt 
            WHERE endedAt IS NULL
        `);
        
        const totalPending = countResult.count;
        console.log(`⚠️  Tìm thấy ${totalPending} lượt làm bài đang chưa kết thúc (endedAt is NULL).`);
        
        if (totalPending === 0) {
            console.log("✅ Không có lượt làm bài nào bị treo.");
            process.exit(0);
        }

        rl.question(`❓ Bạn có muốn đóng TẤT CẢ ${totalPending} lượt này không? (y/n): `, async (ans) => {
            if (ans.toLowerCase() === 'y') {
                console.log("🔄 Đang xử lý...");
                
                // Cập nhật endedAt = NOW() cho tất cả attempt chưa kết thúc
                // Chúng ta dùng NOW() của MySQL
                const result = await query(`
                    UPDATE QuizAttempt 
                    SET endedAt = NOW() 
                    WHERE endedAt IS NULL
                `);
                
                console.log(`✅ Đã đóng ${result.affectedRows} lượt làm bài thành công.`);
            } else {
                console.log("❌ Đã hủy thao tác.");
            }
            process.exit(0);
        });

    } catch (error) {
        console.error("❌ Lỗi:", error);
        process.exit(1);
    }
};

cleanup();
