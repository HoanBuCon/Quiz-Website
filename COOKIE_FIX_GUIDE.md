# 🍪 Hướng Dẫn Fix Cookie "Remember Me" Trên Production

## ⚠️ Vấn Đề
Cookie không được lưu khi deploy lên cPanel shared hosting (production) mặc dù hoạt động tốt trên localhost.

## ✅ Giải Pháp Đã Thực Hiện

### 1. Sửa Cookie Configuration trong Backend

**File đã sửa:** `quiz-backend/routes/auth.js`

**Thay đổi chính:**
- ✅ `sameSite: 'lax'` (phù hợp cho same-site deployment)
- ✅ Thêm `path: '/'` để cookie hoạt động với mọi routes
- ✅ `secure: true` tự động bật khi `NODE_ENV=production`
- ✅ Hỗ trợ `COOKIE_DOMAIN` environment variable (optional)
- ✅ Cookie options được tách riêng để dễ debug

**Lý do:**
- `sameSite: 'lax'` phù hợp khi frontend/backend cùng domain (liemdai.io.vn)
- `sameSite: 'none'` chỉ cần khi cross-domain (api.domain.com vs domain.com)
- `COOKIE_DOMAIN` giúp cookie hoạt động trên subdomain nếu cần
- `secure: true` bắt buộc trên HTTPS production

---

## 🚀 Các Bước Deploy Lên Production (cPanel)

### Bước 1: Cấu Hình Backend (.env)

Tạo file `.env` trong thư mục `quiz-backend/` trên server với nội dung:

```env
# Node Environment
NODE_ENV=production

# Database
DATABASE_URL="mysql://your_username:your_password@localhost:3306/your_database"

# JWT Secret (Tạo random string dài)
JWT_SECRET="your_super_secret_random_string_here_min_32_chars"

# CORS - Chỉ cho phép domain của bạn
CORS_ORIGIN=https://liemdai.io.vn,https://www.liemdai.io.vn

# ⚠️ Cookie Domain (OPTIONAL)
# Để trống nếu frontend và backend cùng domain chính xác
# Set thành .liemdai.io.vn (có dấu chấm) nếu cần hoạt động trên subdomain
COOKIE_DOMAIN=

# SMTP (nếu dùng forgot password)
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-smtp-password
SMTP_FROM="Quiz App <your-email@domain.com>"

# Base Path (nếu cPanel map backend vào /api)
PASSENGER_BASE_URI=/api

# Documents
DOCUMENTS_DIR=../documents
```

### Bước 2: Cấu Hình Frontend (.env)

Tạo file `.env.production` trong thư mục root với nội dung:

```env
# API URL - Phải trùng với domain production
REACT_APP_API_BASE_URL=https://liemdai.io.vn/api

# Hoặc nếu backend ở subdomain khác:
# REACT_APP_API_BASE_URL=https://api.liemdai.io.vn
```

### Bước 3: Kiểm Tra HTTPS

**QUAN TRỌNG:** Cookie với `secure: true` và `sameSite: 'none'` chỉ hoạt động trên HTTPS!

Đảm bảo:
- ✅ Website có SSL certificate (https://)
- ✅ Không có mixed content (HTTP + HTTPS)
- ✅ CORS_ORIGIN trong backend phải dùng `https://`

### Bước 4: Kiểm Tra CORS

Trong file `quiz-backend/index.js`, CORS đã được cấu hình đúng:

```javascript
cors({
  origin: allowedOrigins.length ? allowedOrigins : devDefaults,
  credentials: true, // ✅ Bắt buộc cho cookie
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
```

Đảm bảo `CORS_ORIGIN` trong `.env` production khớp với domain frontend.

---

## 🔍 Cách Kiểm Tra Cookie Hoạt Động

### 1. Chrome DevTools

1. Mở trang web → F12 → Tab **Application** → **Cookies**
2. Tìm cookie tên `auth_token`
3. Kiểm tra:Lax` (same-site) hoặc `None` (cross-site
   - ✅ **Domain:** Phải đúng domain của bạn
   - ✅ **Path:** `/`
   - ✅ **Secure:** `✓` (tick)
   - ✅ **HttpOnly:** `✓` (tick)
   - ✅ **SameSite:** `None` (production)
   - ✅ **Expires:** Nếu chọn "Remember Me" → 30 ngày; nếu không → Session

### 2. Network Tab

1. F12 → **Network** → Chọn request login
2. Kiểm tra **Response Headers:**
   ```
   Set-Cookie: auth_token=...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
   ```

3. Kiểm tra các request tiếp theo:
   - **Request Headers** phải có:
   ```
   Cookie: auth_token=...
   ```

---

## ❌ Common Issues & Solutions

### Issue 1: Cookie không được set
**Nguyên nhân:** HTTPS chưa được bật, CORS chưa đúng, hoặc cookie path conflict

**Giải pháp:**
```bash
# Kiểm tra console browser có lỗi không
# Lỗi thường gặp:
# "Cookie has been blocked..."
```
→ Đảm bảo:
1. Website dùng HTTPS
2. CORS_ORIGIN đúng domain
3. Thử set COOKIE_DOMAIN=.liemdai.io.vn (có dấu chấm)

### Issue 2: Cookie bị xóa khi reload
**Nguyên nhân:** `rememberMe` không được gửi lên backend

**Giải pháp:**
Kiểm tra trong MaintenancePage.tsx:
```typescript
const response = await AuthAPI.login(email, password, rememberMe);
```
→ Đảm bảo `rememberMe` state được truyền đúng

### Issue 3: CORS error
**Lỗi:** `Access to fetch at ... has been blocked by CORS policy`

**Giải pháp:**
1. Kiểm tra `CORS_ORIGIN` trong backend `.env`
2. Đảm bảo frontend gọi đúng URL trong `.env.production`
3. Restart backend sau khi sửa .env

---

## 📝 Checklist Deploy
Backend `.env` có `COOKIE_DOMAIN` (để trống hoặc set `.yourdomain.com`)
- [ ] Frontend `.env.production` có `REACT_APP_API_BASE_URL=https://yourdomain.com/api`
- [ ] Website có HTTPS (SSL certificate)
- [ ] Cookie `auth_token` xuất hiện trong DevTools
- [ ] Cookie có `Secure` và `SameSite=Lax_APP_API_BASE_URL=https://yourdomain.com/api`
- [ ] Website có HTTPS (SSL certificate)
- [ ] Cookie `auth_token` xuất hiện trong DevTools
- [ ] Cookie có `Secure` và `SameSite=None`
- [ ] Test login với "Remember Me" checked
- [ ] Test đóng browser và mở lại → vẫn logged in

---

## 🧪 Test Script

Chạy lệnh sau để test cookie từ terminal:

```bash
# Login và lưu cookie
curl -X POST https://liemdai.io.vn/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","rememberMe":true}' \
  -c cookies.txt -v

# Kiểm tra xem cookie có được lưu không
cat cookies.txt

# Test request với cookie
curl https://liemdai.io.vn/api/auth/me \
  -b cookies.txt -v
```

---

## 📚 Tham Khảo

- [MDN - SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [Chrome Cookie Policy](https://www.chromium.org/updates/same-site)
- [CORS with Credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#requests_with_credentials)

---
lax'` cho production (phù hợp same-site)
2. ✅ `path: '/'` cho tất cả cookie operations
3. ✅ `secure: true` tự động khi production
4. ✅ Hỗ trợ `COOKIE_DOMAIN` env variable (optional)

**Cấu hình cần thiết trên production:**
1. ✅ HTTPS (SSL certificate)
2. ✅ CORS_ORIGIN đúng domain
3. ✅ NODE_ENV=production trong backend .env
4. ✅ COOKIE_DOMAIN (optional, thử `.liemdai.io.vn` nếu cookie không lưu)

**Kết quả:** Cookie "Remember Me" sẽ hoạt động 30 ngày trên production! 🎉

---

## 🆘 Nếu Vẫn Không Hoạt Động

### Debug Steps:

1. **Kiểm tra Network tab trong Chrome DevTools:**
   - Request login → Response Headers có `Set-Cookie` không?
   - Nếu không có → Backend không gửi cookie

2. **Kiểm tra Application tab → Cookies:**
   - Cookie `auth_token` có xuất hiện không?
   - Nếu không → Cookie bị block bởi browser

3. **Thử các giá trị COOKIE_DOMAIN:**
   ```env
   # Option 1: Để trống (mặc định)
   COOKIE_DOMAIN=
   
   # Option 2: Set domain chính (có dấu chấm)
   COOKIE_DOMAIN=.liemdai.io.vn
   
   # Option 3: Set domain chính (không dấu chấm)
   COOKIE_DOMAIN=liemdai.io.vn
   ```

4. **Kiểm tra CORS:**
   - Console có lỗi CORS không?
   - CORS_ORIGIN phải match chính xác với URL frontend

5. **Test với curl:**
   ```bash
   curl -X POST https://liemdai.io.vn/api/auth/login \
     -H "Content-Type: application/json" \
     -H "Origin: https://liemdai.io.vn" \
     -d '{"email":"test@example.com","password":"test123","rememberMe":true}' \
     -v 2>&1 | grep -i "set-cookie"
   ```
   
   Phải thấy dòng `Set-Cookie: auth_token=...`
2. ✅ CORS_ORIGIN đúng domain
3. ✅ NODE_ENV=production trong backend .env

**Kết quả:** Cookie "Remember Me" sẽ hoạt động 30 ngày trên production! 🎉
