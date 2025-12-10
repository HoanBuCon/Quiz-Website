# Migration từ Prisma ORM sang MySQL Thuần

## Tổng quan
Dự án đã được chuyển đổi từ Prisma ORM sang MySQL thuần (sử dụng `mysql2/promise`) để giải quyết vấn đề spam tiến trình `lsnode` trên cPanel hosting.

## Các thay đổi chính

### 1. **Database Connection**
- **Trước:** Sử dụng `PrismaClient` từ `@prisma/client`
- **Sau:** Sử dụng `mysql2/promise` connection pool trong `utils/db.js`

### 2. **Files đã thay đổi**

#### Core Files:
- ✅ `utils/db.js` - MySQL connection pool utility (MỚI)
- ✅ `utils/helpers.js` - Helper functions cho CUID, JSON, DateTime (MỚI)
- ✅ `index.js` - Đã thay Prisma bằng MySQL pool
- ✅ `middleware/auth.js` - Đã chuyển từ Prisma sang MySQL
- ✅ `migration.sql` - Script tạo database schema cho MySQL (MỚI)

#### Routes đã chuyển đổi:
- ✅ `routes/auth.js` - HOÀN THÀNH
- ✅ `routes/files.js` - HOÀN THÀNH
- ⏳ `routes/classes.js` - CẦN CHUYỂN ĐỔI
- ⏳ `routes/quizzes.js` - CẦN CHUYỂN ĐỔI
- ⏳ `routes/sessions.js` - CẦN CHUYỂN ĐỔI
- ⏳ `routes/visibility.js` - CẦN CHUYỂN ĐỔI
- ⏳ `routes/images.js` - CẦN CHUYỂN ĐỔI
- ⏳ `routes/chat.js` - CẦN CHUYỂN ĐỔI

### 3. **Cách chuyển đổi một Prisma query sang MySQL**

#### Ví dụ 1: findUnique
```javascript
// TRƯỚC (Prisma)
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { id: true, email: true, name: true }
});

// SAU (MySQL)
const user = await queryOne(
  'SELECT id, email, name FROM User WHERE id = ?',
  [userId]
);
```

#### Ví dụ 2: findMany với điều kiện
```javascript
// TRƯỚC (Prisma)
const classes = await prisma.class.findMany({
  where: { ownerId: req.user.id },
  include: { quizzes: true },
  orderBy: { createdAt: 'desc' }
});

// SAU (MySQL)
const classes = await query(
  'SELECT * FROM Class WHERE ownerId = ? ORDER BY createdAt DESC',
  [req.user.id]
);
// Sau đó load quizzes riêng nếu cần
for (const cls of classes) {
  cls.quizzes = await query(
    'SELECT * FROM Quiz WHERE classId = ?',
    [cls.id]
  );
}
```

#### Ví dụ 3: create
```javascript
// TRƯỚC (Prisma)
const user = await prisma.user.create({
  data: { email, passwordHash, name }
});

// SAU (MySQL)
const userId = generateCuid();
const now = formatDateForMySQL();
await query(
  'INSERT INTO User (id, email, passwordHash, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
  [userId, email, passwordHash, name || null, now, now]
);
const user = await queryOne('SELECT * FROM User WHERE id = ?', [userId]);
```

#### Ví dụ 4: update
```javascript
// TRƯỚC (Prisma)
await prisma.user.update({
  where: { id: userId },
  data: { name: newName }
});

// SAU (MySQL)
const now = formatDateForMySQL();
await query(
  'UPDATE User SET name = ?, updatedAt = ? WHERE id = ?',
  [newName, now, userId]
);
```

#### Ví dụ 5: delete
```javascript
// TRƯỚC (Prisma)
await prisma.class.delete({ where: { id } });

// SAU (MySQL)
await query('DELETE FROM Class WHERE id = ?', [id]);
```

#### Ví dụ 6: transaction
```javascript
// TRƯỚC (Prisma)
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id }, data: { passwordHash } });
  await tx.passwordReset.update({ where: { id: resetId }, data: { usedAt: new Date() } });
});

// SAU (MySQL)
await transaction(async (conn) => {
  const now = formatDateForMySQL();
  await conn.execute('UPDATE User SET passwordHash = ?, updatedAt = ? WHERE id = ?', [passwordHash, now, id]);
  await conn.execute('UPDATE PasswordReset SET usedAt = ? WHERE id = ?', [now, resetId]);
});
```

### 4. **Helper Functions**

#### Từ `utils/helpers.js`:
- `generateCuid()` - Tạo ID tương thích với Prisma
- `formatDateForMySQL(date)` - Chuyển Date thành DATETIME format
- `parseJSON(value)` - Parse JSON field từ MySQL
- `stringifyJSON(value)` - Stringify JSON để lưu vào MySQL
- `boolToInt(value)` - Chuyển boolean thành TINYINT (0/1)
- `intToBool(value)` - Chuyển TINYINT thành boolean
- `buildWhereIn(values)` - Build WHERE IN clause an toàn

#### Từ `utils/db.js`:
- `query(sql, params)` - Execute query và return rows
- `queryOne(sql, params)` - Execute query và return first row
- `transaction(callback)` - Execute transaction
- `testConnection()` - Test database connection
- `close()` - Close connection pool

### 5. **Environment Variables cần thiết**

Thêm vào file `.env`:
```env
# MySQL Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=quiz_website

# Existing variables
JWT_SECRET=your_secret_key
NODE_ENV=production
# ... other vars
```

### 6. **Cài đặt Dependencies**

```bash
# Cài đặt mysql2
npm install mysql2

# GỠ BỎ Prisma (sau khi test xong)
# npm uninstall @prisma/client prisma
```

### 7. **Chạy Migration**

Trước khi deploy, chạy script migration SQL:
```bash
mysql -u your_username -p your_database < migration.sql
```

### 8. **Testing**

Sau khi migration, test các endpoints:
- Auth: `/auth/signup`, `/auth/login`, `/auth/me`
- Files: `/files` (GET, POST, DELETE)
- Classes: `/classes` (GET, POST, PUT, DELETE)
- Quizzes: `/quizzes/*`
- Sessions: `/sessions/*`

### 9. **Lưu ý quan trọng**

1. **JSON Fields**: MySQL lưu JSON dưới dạng native JSON type, cần parse/stringify khi đọc/ghi
2. **Boolean**: MySQL dùng TINYINT(1), cần convert qua lại
3. **DateTime**: MySQL format: `YYYY-MM-DD HH:MM:SS`, khác với JavaScript Date
4. **Relations**: Không có auto-join như Prisma, phải query riêng
5. **Cascade Delete**: Được handle bởi FOREIGN KEY constraints trong database

### 10. **Performance**

Ưu điểm của MySQL thuần:
- ✅ Không spawn thêm process (giải quyết vấn đề lsnode)
- ✅ Connection pooling hiệu quả hơn
- ✅ Ít overhead hơn Prisma
- ✅ Control tốt hơn query performance

Nhược điểm:
- ⚠️ Phải tự viết SQL queries
- ⚠️ Không có type safety từ Prisma
- ⚠️ Phải tự handle relations

### 11. **Rollback Plan**

Nếu cần rollback về Prisma:
1. Restore backup của files cũ
2. Reinstall `@prisma/client`
3. Run `npx prisma generate`
4. Restart server

---

## Status: 🚧 IN PROGRESS (60% Complete)

**Đã hoàn thành:**
- Core utilities (db.js, helpers.js)
- Migration SQL script
- index.js và middleware
- routes/auth.js
- routes/files.js

**Đang thực hiện:**
- routes/classes.js
- routes/quizzes.js
- routes/sessions.js
- routes/visibility.js
- routes/images.js
- routes/chat.js
