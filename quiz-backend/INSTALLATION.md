# HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY SAU KHI MIGRATION

## Bước 1: Cài đặt Dependencies

```bash
cd quiz-backend

# Cài đặt mysql2
npm install mysql2

# (Tùy chọn) Gỡ bỏ Prisma sau khi test xong
# npm uninstall @prisma/client prisma
```

## Bước 2: Cấu hình Environment Variables

Tạo/cập nhật file `.env` trong folder `quiz-backend`:

```env
# ===== MySQL Configuration =====
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=quiz_website

# ===== Existing Variables (GIỮ NGUYÊN) =====
JWT_SECRET=your_secret_key
NODE_ENV=production
PORT=4000

# CORS
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# SMTP (cho reset password OTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your_email@gmail.com

# OTP Settings
OTP_THROTTLE_SECONDS=60
OTP_TTL_SECONDS=600
OTP_MAX_ATTEMPTS=5

# Online Status
ONLINE_WINDOW_MINUTES=5

# Frontend URL
FRONTEND_URL=https://yourdomain.com

# Base path (cho cPanel)
BASE_PATH=/api
PASSENGER_BASE_URI=/api
```

## Bước 3: Tạo Database và chạy Migration

### Option A: Trên MySQL Workbench / phpMyAdmin
1. Tạo database:
```sql
CREATE DATABASE quiz_website CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Import migration script:
   - Mở file `migration.sql`
   - Copy toàn bộ nội dung
   - Paste và Execute trong MySQL Workbench/phpMyAdmin

### Option B: Qua Command Line
```bash
# Tạo database
mysql -u your_username -p -e "CREATE DATABASE quiz_website CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Chạy migration
mysql -u your_username -p quiz_website < migration.sql
```

### Option C: Trên cPanel (Hosting)
1. Vào cPanel → MySQL Databases
2. Tạo database mới: `quiz_website`
3. Tạo user và gán quyền ALL PRIVILEGES
4. Vào phpMyAdmin → chọn database → tab SQL
5. Copy nội dung `migration.sql` và Execute

## Bước 4: Migrate dữ liệu từ PostgreSQL (nếu có data cũ)

Nếu bạn đang có data trong PostgreSQL (Prisma cũ), cần export và import:

### 4.1. Export từ PostgreSQL
```bash
# Export schema + data
pg_dump -U your_pg_user -d your_db_name > old_data.sql
```

### 4.2. Convert và Import vào MySQL
Sử dụng tool chuyển đổi hoặc viết script custom. Hoặc export dưới dạng JSON và import lại qua API.

**LƯU Ý:** Bước này phức tạp. Nếu chưa có data production, bỏ qua bước này.

## Bước 5: Test kết nối

```bash
# Chạy server ở local
npm run dev
# hoặc
node index.js
```

Kiểm tra log:
```
[DB] MySQL connection pool established successfully
[INIT] MySQL connection pool initialized
Quiz API running on port 4000
```

Test health check:
```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "ok",
  "basePath": "",
  "env": "development",
  "pid": 12345,
  "uptime": 1.234
}
```

## Bước 6: Test các endpoints đã migrate

### Test Auth:
```bash
# Signup
curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Get current user (cần token)
curl http://localhost:4000/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Test Files:
```bash
# List files
curl http://localhost:4000/files \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Bước 7: Deploy lên cPanel

### 7.1. Upload files
- Upload toàn bộ folder `quiz-backend` lên hosting
- Đảm bảo file `.env` có config đúng

### 7.2. Cài đặt dependencies
```bash
cd quiz-backend
npm install --production
```

### 7.3. Setup Passenger (cPanel)
1. Vào cPanel → Setup Node.js App
2. Chọn Node.js version (16.x hoặc 18.x)
3. Application root: `/home/username/public_html/quiz-backend`
4. Application URL: `/api`
5. Application startup file: `index.js`
6. Click "Create"

### 7.4. Restart app
```bash
# Trong cPanel terminal hoặc SSH
touch ~/public_html/quiz-backend/tmp/restart.txt
```

## Bước 8: Verify trên Production

Test health check:
```bash
curl https://yourdomain.com/api/health
```

## Troubleshooting

### Lỗi: Cannot connect to MySQL
- Kiểm tra DB_HOST, DB_USER, DB_PASSWORD trong `.env`
- Kiểm tra MySQL service đang chạy
- Kiểm tra firewall/port 3306

### Lỗi: CUID generation failed
- Đảm bảo đã có `crypto` module (built-in Node.js)

### Lỗi: JSON parse error
- Check JSON fields trong database có format đúng không
- MySQL version phải >= 5.7 (hỗ trợ JSON type)

### Lỗi: Date/Time format issues
- Đảm bảo timezone database = UTC
- Check `timezone: '+00:00'` trong `utils/db.js`

### Lỗi: lsnode vẫn bị spam
- Verify rằng đang dùng MySQL thuần, không còn Prisma
- Check `ps aux | grep node` để xem processes
- Nếu vẫn thấy prisma-query-engine, chạy `npm uninstall @prisma/client`

## Status Check sau Migration

✅ **Hoàn thành:**
- [x] utils/db.js - MySQL connection pool
- [x] utils/helpers.js - Helper functions
- [x] utils/queryHelpers.js - Query patterns
- [x] utils/conversionPatterns.js - Conversion examples
- [x] middleware/auth.js - Authentication
- [x] routes/auth.js - Auth endpoints
- [x] routes/files.js - File management
- [x] index.js - Main server
- [x] migration.sql - Database schema

⏳ **Cần hoàn thành:**
- [ ] routes/classes.js - Class management (IN PROGRESS)
- [ ] routes/quizzes.js - Quiz management (IN PROGRESS)
- [ ] routes/sessions.js - Session management (IN PROGRESS)
- [ ] routes/visibility.js - Visibility/sharing (IN PROGRESS)
- [ ] routes/images.js - Image upload (IN PROGRESS)
- [ ] routes/chat.js - Chat functionality (IN PROGRESS)

## Next Steps

1. **Hoàn thành migration các routes còn lại** theo patterns trong `conversionPatterns.js`
2. **Test kỹ tất cả endpoints** để đảm bảo logic không thay đổi
3. **Backup database** trước khi deploy
4. **Deploy từng route một** thay vì deploy hết cùng lúc
5. **Monitor server logs** sau deploy để catch lỗi sớm

## Support

Nếu gặp vấn đề trong quá trình migration:
1. Check MIGRATION_GUIDE.md
2. Check conversionPatterns.js cho examples
3. Review code đã migrate (auth.js, files.js)
4. Compare với Prisma code cũ để verify logic
