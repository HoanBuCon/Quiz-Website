# 🚀 Deploy Cookie Fix Lên Production (cPanel)

## ✅ Đã Sửa

1. ✅ Sửa biến env trong `src/utils/auth.ts` từ `REACT_APP_API_URL` → `REACT_APP_API_BASE_URL`
2. ✅ Build frontend mới đã hoàn tất
3. ✅ Backend đã config cookie với `sameSite: 'lax'` và hỗ trợ `COOKIE_DOMAIN`

---

## 📦 Các File Cần Upload Lên cPanel

### 1. Upload Frontend (thư mục `build/`)

Upload toàn bộ nội dung trong folder `build/` lên public_html:
```
build/
  ├── index.html
  ├── static/
  │   ├── css/
  │   ├── js/
  │   └── media/
  └── ...
```

### 2. Upload Backend (thư mục `quiz-backend/`)

Upload toàn bộ folder `quiz-backend/` (bao gồm routes/auth.js đã sửa):
```
quiz-backend/
  ├── routes/
  │   └── auth.js  ✅ (đã sửa cookie config)
  ├── index.js
  ├── package.json
  └── ...
```

---

## ⚙️ Cấu Hình Backend Trên cPanel

Tạo/sửa file `.env` trong `quiz-backend/`:

```env
# Production Mode
NODE_ENV=production

# Database (MySQL trên cPanel)
DATABASE_URL="mysql://your_cpanel_username:your_db_password@localhost:3306/your_database_name"

# JWT Secret (random string dài ít nhất 32 ký tự)
JWT_SECRET="your_super_secret_random_string_here_min_32_chars"

# CORS - Domain của frontend
CORS_ORIGIN=https://liemdai.io.vn,https://www.liemdai.io.vn

# ⚠️ COOKIE DOMAIN - Thử từng option sau:

# OPTION 1: Để trống (thử đầu tiên)
COOKIE_DOMAIN=

# OPTION 2: Nếu không được, uncomment dòng dưới (có dấu chấm)
# COOKIE_DOMAIN=.liemdai.io.vn

# OPTION 3: Nếu vẫn không được, uncomment dòng dưới (không dấu chấm)
# COOKIE_DOMAIN=liemdai.io.vn

# Base Path (cPanel routing)
PASSENGER_BASE_URI=/api

# SMTP (cho forgot password)
SMTP_HOST=your_smtp_server
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@domain.com
SMTP_PASS=your_smtp_password
SMTP_FROM="Quiz App <your_email@domain.com>"
```

---

## 🔍 Test Sau Khi Deploy

### Bước 1: Clear Cache Browser
- Ctrl+Shift+Delete → Xóa Cookies & Cache
- Hoặc mở Incognito/Private window

### Bước 2: Test Login
1. Truy cập `https://liemdai.io.vn/welcome`
2. Login với **"Remember Me" checked**
3. Mở F12 → Tab **Application** → **Cookies**
4. Kiểm tra cookie `auth_token`:
   ```
   Name: auth_token
   Value: eyJ... (JWT token)
   Domain: .liemdai.io.vn hoặc liemdai.io.vn
   Path: /
   Expires: (30 ngày sau)
   HttpOnly: ✓
   Secure: ✓
   SameSite: Lax
   ```

### Bước 3: Test Remember Me
1. Đóng browser hoàn toàn
2. Mở lại browser
3. Vào `https://liemdai.io.vn` → Phải **tự động logged in** ✅

---

## ❌ Nếu Vẫn Không Hoạt Động

### Debug 1: Kiểm tra Network
1. F12 → Tab **Network**
2. Login → Tìm request `/api/auth/login`
3. Xem **Response Headers** có `Set-Cookie` không?
   ```
   Set-Cookie: auth_token=...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000; Domain=.liemdai.io.vn
   ```
4. **Nếu KHÔNG có `Set-Cookie`** → Backend chưa gửi cookie → Kiểm tra backend .env

### Debug 2: Cookie bị Block
1. Console tab có lỗi cookie?
2. Lỗi thường gặp:
   ```
   Cookie "auth_token" has been rejected because...
   ```
3. Thử thay đổi `COOKIE_DOMAIN` trong backend `.env`:
   - Option 1: Để trống
   - Option 2: `.liemdai.io.vn`
   - Option 3: `liemdai.io.vn`

### Debug 3: CORS Error
Nếu thấy lỗi CORS:
```
Access to fetch at 'https://liemdai.io.vn/api/auth/login' from origin 'https://liemdai.io.vn' has been blocked by CORS policy
```

→ Kiểm tra backend `.env`:
```env
CORS_ORIGIN=https://liemdai.io.vn,https://www.liemdai.io.vn
```

### Debug 4: API URL Sai
Console có lỗi:
```
Failed to fetch
```

→ Kiểm tra frontend đang gọi đúng URL:
- Mở Console → Chạy:
  ```javascript
  console.log(process.env.REACT_APP_API_BASE_URL)
  ```
- Phải trả về: `https://liemdai.io.vn/api`
- Nếu sai → Build lại với đúng env

---

## 🧪 Quick Test Script

Chạy từ terminal/cmd local để test API:

```bash
# Test login
curl -X POST https://liemdai.io.vn/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://liemdai.io.vn" \
  -d "{\"email\":\"your_test_email@example.com\",\"password\":\"your_password\",\"rememberMe\":true}" \
  -c cookies.txt -v 2>&1 | grep -i "set-cookie"

# Kiểm tra cookie file
cat cookies.txt

# Test với cookie
curl https://liemdai.io.vn/api/auth/me \
  -b cookies.txt -v
```

**Kết quả mong đợi:**
- Phải thấy `Set-Cookie: auth_token=...` trong response
- File `cookies.txt` phải có cookie `auth_token`
- Request `/auth/me` phải trả về 200 OK

---

## 📝 Checklist Hoàn Chỉnh

**Frontend:**
- [x] Build với `REACT_APP_API_BASE_URL=https://liemdai.io.vn/api`
- [ ] Upload folder `build/` lên public_html
- [ ] Website có SSL (HTTPS) hoạt động

**Backend:**
- [x] File `routes/auth.js` đã sửa cookie config
- [ ] Upload code backend mới lên cPanel
- [ ] File `.env` có đầy đủ config (NODE_ENV, CORS_ORIGIN, COOKIE_DOMAIN)
- [ ] Restart Node.js app trên cPanel

**Test:**
- [ ] Clear browser cache/cookies
- [ ] Login với "Remember Me"
- [ ] Cookie `auth_token` xuất hiện trong DevTools
- [ ] Cookie có `Expires` = 30 ngày
- [ ] Đóng browser → Mở lại → Vẫn logged in ✅

---

## 📞 Support

Nếu vẫn gặp vấn đề, gửi thông tin sau:
1. Screenshot Network tab → Login request → Response Headers
2. Screenshot Application tab → Cookies
3. Console log có lỗi gì
4. Backend `.env` CORS_ORIGIN và COOKIE_DOMAIN đang set gì

Chi tiết xem file: [COOKIE_FIX_GUIDE.md](COOKIE_FIX_GUIDE.md)
