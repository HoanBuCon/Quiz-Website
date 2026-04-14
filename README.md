# Quiz Website (FE + BE)

<div align="center">
  <a href="https://liemdai.io.vn" target="_blank">
    <!-- Keep wallpaper -->
    <img src="./public/readme.png" alt="Preview" />
  </a>
</div>

---

# English

## Demo
- https://liemdai.io.vn/

## 1. UI Overview
A modern quiz website with full Dark/Light mode and responsive design. Navigation: Home, Classes, Create, Documents. Smooth animations, quiz minimap, and optional background music.

- FE stack: React 18, TypeScript, React Router, TailwindCSS
- Token storage: LocalStorage
- API base: `REACT_APP_API_BASE_URL` (dev default: `http://localhost:4000/api`)

## 2. Core Features
- Class management (create/update/delete, public, share)
- Quiz management (create/update/delete, publish)
- Question types: `single`, `multiple`, `text`, `drag`, `composite` (nested sub-questions)
- Take quizzes and scoring (Quiz Sessions)
- Image upload/delete for questions & options (multer + static)
- Documents management (docs/json/txt)
- Public & Share with access control:
  - `PublicItem` marks class/quiz as public
  - `ShareItem` generates share codes
  - `SharedAccess` stores user access: `full` | `navigationOnly`
- Forgot password via OTP (SMTP)

## 3. Business Logic
### 3.1. Classes
- Create: POST `/api/classes`
- Update: PUT `/api/classes/:id` (sync `PublicItem` when `isPublic` changes)
- Delete: DELETE `/api/classes/:id`
- List:
  - Mine: GET `/api/classes?mine=true` (owned + shared)
  - Public: GET `/api/classes` (merge from `PublicItem` and legacy `isPublic`)

### 3.2. Quizzes
- Create: POST `/api/quizzes`
  - Save `questions` with `type`, `options`, `correctAnswers`, `questionImage`, `optionImages`
  - If `composite`, create child questions via `parentId`
- Update: PUT `/api/quizzes/:id` (replace questions; sync `PublicItem` on `published`)
- Delete: DELETE `/api/quizzes/:id` (cleanup images)
- Get one: GET `/api/quizzes/:id` (supports `shortId`; access: owner | public | shared | class shared full)
- By class: GET `/api/quizzes/by-class/:classId` (filters by access and `accessLevel`)

### 3.3. Public & Share
- Public toggle: POST `/api/visibility/public` (targetType: `class|quiz`)
- Share toggle: POST `/api/visibility/share`
- Share status: GET `/api/visibility/share/status?targetType=...&targetId=...`
- Claim by code/id: POST `/api/visibility/claim`
- Remove access: DELETE `/api/visibility/access`
- List shared: `/api/visibility/shared/classes`, `/api/visibility/shared/quizzes`

### 3.4. Sessions
- Start: POST `/api/sessions/start`
- Submit: POST `/api/sessions/submit`
- By quiz: GET `/api/sessions/by-quiz/:quizId`
- Detail: GET `/api/sessions/:id`

### 3.5. Images & Files
- Upload image: POST `/api/images/upload` (FormData)
- Delete image: DELETE `/api/images/:filename`
- Files CRUD: `/api/files`
- Static: `/api/uploads/...` (prod can also map `/uploads`)

### 3.6. Auth & OTP
- Signup: POST `/api/auth/signup`
- Login: POST `/api/auth/login` (JWT HS256, header `Authorization: Bearer ...`)
- Me: GET `/api/auth/me`
- Forgot password:
  - Dev token: `/api/auth/forgot` → `/api/auth/reset`
  - OTP: `/api/auth/forgot-otp` → `/api/auth/reset-with-otp`

## 4. Backend Overview (quiz-backend)
- Express 5, Prisma 6, PostgreSQL
- Models: `User`, `Class`, `Quiz`, `Question`, `QuizSession`, `UploadedFile`, `PublicItem`, `ShareItem`, `SharedAccess`, `PasswordReset`
- Enums:
  - `QuestionType`: `single | multiple | text | drag | composite`
  - `FileType`: `docs | json | txt`
  - `TargetType`: `class | quiz`
  - `AccessLevel`: `full | navigationOnly`
- Routers (mounted under BASE_PATH, default `/api`): `/auth`, `/classes`, `/quizzes`, `/sessions`, `/files`, `/images`, `/visibility`
- Health: `GET {BASE_PATH}/health`

## 5. Local Installation (Development)

First, clone the repository:
```bash
git clone https://github.com/HoanBuCon/Quiz-Website.git
cd Quiz-Website
```

### 5.1 Database Setup (MySQL)
The application relies on a **MySQL Database**. You can use a local MySQL server or a remote one.

1. Create a blank database (e.g., `quiz_website`).
2. Import the schema provided in `quiz-backend/migration.sql`. You can use an interface like phpMyAdmin or run the MySQL CLI command:
   ```bash
   mysql -u username -p quiz_website < quiz-backend/migration.sql
   ```
*(Note: If you plan to use the `docker-compose.yml`, please ensure it is configured for MySQL, as the default may be set to PostgreSQL).*

### 5.2 Backend Setup
```bash
cd quiz-backend
npm install

# Create environment variable file
cp .env.development.example .env
```
Edit `quiz-backend/.env` to configure your MySQL connection (see Section 5.4 for details).

Initialize Prisma and start the backend:
```bash
# Generate Prisma Client (if the backend uses Prisma)
npm run prisma:generate

# Start backend (Running on http://localhost:4000)
npm run dev
```

### 5.3 Frontend Setup
Open a new terminal at the project root (`Quiz-Website`):
```bash
npm install

# Ensure you have a .env file locally with:
# REACT_APP_API_BASE_URL=http://localhost:4000

# Start frontend (Running on http://localhost:3000)
npm start
```

### 5.4 Environment Variables Configuration (.env)

Below is the guide to configuring the `.env` files for both Development and Production:

**Frontend Environment (`Quiz-Website/.env`):**
- Development: Copy `.env.development.example` to `.env`. Set `REACT_APP_API_BASE_URL=http://localhost:4000`.
- Production: Copy `.env.production.example` to `.env` (or `.env.production`). Set `REACT_APP_API_BASE_URL=https://yourdomain.com/api` (Must match your actual backend domain and use HTTPS).

**Backend Environment (`quiz-backend/.env`):**
Copy `quiz-backend/.env.development.example` or `quiz-backend/.env.production.example` to `quiz-backend/.env`.
- `DATABASE_URL`: Your MySQL connection string (e.g., `mysql://user:pass@host:3306/db`).
- `NODE_ENV`: `development` for local, `production` for server.
- `JWT_SECRET`: A secure random string used for generating authentication tokens.
- `CORS_ORIGIN`: The exact URL of your frontend (e.g., `http://localhost:3000` or `https://yourdomain.com`).
- `SMTP_*`: Your SMTP email credentials (essential for sending Forgot Password OTPs).
- `GEMINI_API_KEY`: Your Google Gemini API Key required for AI question generation.

## 6. Production Installation

### 6.1 Deployment via Docker (VPS)
For VPS deployments, the provided `docker-compose.yml` runs the entire stack (DB, Frontend, Backend).
1. Update environment variables in `docker-compose.yml` and backend `.env`.
2. Build and start:
```bash
docker-compose up -d --build
```
The Frontend runs on port `8082` and Backend on `4000`. You may configure an Nginx reverse proxy.

### 6.2 Deployment via cPanel
- **Database:** Create PostgreSQL DB on cPanel (or use Remote DB) and import schema.
- **Backend:**
  - Setup a Node.js App pointing to the `quiz-backend` directory.
  - Startup file: `index.js`.
  - Add ENV vars: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`.
  - Via built-in terminal: Run `npm install` and `npm run prisma:generate`.
- **Frontend:**
  - Set root `.env`: `REACT_APP_API_BASE_URL=https://yourdomain.com/api`
  - Compile locally: `npm run build`
  - Upload the contents of the `build` folder to the `public_html/` root on cPanel.

## 7. Notes
- JWT token is stored in LocalStorage (Header fetches `/auth/me` to display name)
- CORS: include both with/without `www` if in use
- Images are stored under `quiz-backend/public/uploads` (prod may map under `public_html/uploads`)

---

# Tiếng Việt

## Demo
- https://liemdai.io.vn/

## 1. Giới thiệu giao diện
Website quiz với giao diện hiện đại, hỗ trợ Dark/Light mode, responsive đầy đủ. Thanh điều hướng gồm: Trang chủ, Lớp học, Tạo lớp, Tài liệu. UI có hiệu ứng chuyển động mượt, mini-map khi làm bài, trình phát nhạc nền tùy chọn.

- Công nghệ FE: React 18, TypeScript, React Router, TailwindCSS
- Lưu token: LocalStorage
- Config API: `REACT_APP_API_BASE_URL` (mặc định dev: `http://localhost:4000/api`)

## 2. Tính năng chính
- Quản lý lớp học (tạo/sửa/xóa, public, chia sẻ)
- Quản lý bài kiểm tra (tạo/sửa/xóa, xuất bản/publish)
- Loại câu hỏi: `single`, `multiple`, `text`, `drag`, `composite` (câu tổng hợp có sub-questions)
- Làm bài và chấm điểm (Quiz Sessions)
- Upload/Xóa ảnh cho câu hỏi & lựa chọn (multer + static serving)
- Quản lý tệp tài liệu (docs/json/txt)
- Công khai (Public) và Chia sẻ (Share) với phân quyền:
  - Bảng `PublicItem` đánh dấu class/quiz công khai
  - Bảng `ShareItem` sinh mã chia sẻ
  - Bảng `SharedAccess` lưu quyền truy cập của user: `full` | `navigationOnly`
- Quên mật khẩu qua OTP (SMTP)

## 3. Luồng/Logic nghiệp vụ
### 3.1. Lớp học (Class)
- Tạo lớp: POST `/api/classes`
- Cập nhật lớp: PUT `/api/classes/:id` (có đồng bộ `PublicItem` khi đổi `isPublic`)
- Xóa lớp: DELETE `/api/classes/:id`
- Danh sách lớp:
  - Mine: GET `/api/classes?mine=true` (bao gồm lớp sở hữu và lớp được share)
  - Public: GET `/api/classes` (ghép từ `PublicItem` và cờ legacy `isPublic`)

### 3.2. Bài kiểm tra (Quiz)
- Tạo quiz: POST `/api/quizzes`
  - Lưu `questions` kèm `type`, `options`, `correctAnswers`, `questionImage`, `optionImages`
  - Nếu `composite`, tạo các câu con (subQuestions) liên kết bằng `parentId`
- Sửa quiz: PUT `/api/quizzes/:id`
  - Cho phép thay thế toàn bộ câu hỏi, đồng bộ `PublicItem` khi đổi `published`
- Xóa quiz: DELETE `/api/quizzes/:id` (dọn ảnh đi kèm)
- Lấy quiz: GET `/api/quizzes/:id`
  - Hỗ trợ truy cập bằng `shortId` (utils/share)
  - Kiểm tra quyền: owner, public (quiz/class), share trực tiếp, hoặc share class `full`
- Danh sách quiz theo lớp: GET `/api/quizzes/by-class/:classId`
  - Lọc theo quyền: owner | public | shared (với `accessLevel`)

### 3.3. Công khai & Chia sẻ
- Public toggle: POST `/api/visibility/public` (targetType: `class|quiz`)
- Share toggle: POST `/api/visibility/share`
- Trạng thái share: GET `/api/visibility/share/status?targetType=...&targetId=...`
- Claim quyền theo code/id: POST `/api/visibility/claim`
- Gỡ quyền: DELETE `/api/visibility/access`
- Liệt kê mục được chia sẻ: `/api/visibility/shared/classes`, `/api/visibility/shared/quizzes`

### 3.4. Phiên làm bài (Sessions)
- Bắt đầu: POST `/api/sessions/start`
- Nộp bài: POST `/api/sessions/submit`
- Theo quiz: GET `/api/sessions/by-quiz/:quizId`
- Chi tiết: GET `/api/sessions/:id`

### 3.5. Ảnh & Tệp
- Upload ảnh: POST `/api/images/upload` (FormData)
- Xóa ảnh: DELETE `/api/images/:filename`
- Files: `/api/files` (list, upload docs/json/txt, delete)
- Static: `/api/uploads/...` (prod có thể map thêm `/uploads`)

### 3.6. Xác thực & OTP
- Đăng ký: POST `/api/auth/signup`
- Đăng nhập: POST `/api/auth/login` (JWT HS256, header `Authorization: Bearer ...`)
- Lấy user: GET `/api/auth/me`
- Quên mật khẩu:
  - Dev token: POST `/api/auth/forgot` → reset bằng `/api/auth/reset`
  - OTP qua email: `/api/auth/forgot-otp` → `/api/auth/reset-with-otp`

## 4. Cấu trúc Backend (quiz-backend)
- Express 5, Prisma 6, PostgreSQL
- Prisma schema có các model: `User`, `Class`, `Quiz`, `Question`, `QuizSession`, `UploadedFile`, `PublicItem`, `ShareItem`, `SharedAccess`, `PasswordReset`
- Enum:
  - `QuestionType`: `single | multiple | text | drag | composite`
  - `FileType`: `docs | json | txt`
  - `TargetType`: `class | quiz`
  - `AccessLevel`: `full | navigationOnly`
- Router chính (đều mount dưới BASE_PATH, mặc định `/api`):
  - `/auth`, `/classes`, `/quizzes`, `/sessions`, `/files`, `/images`, `/visibility`
- Health check: `GET {BASE_PATH}/health`

## 5. Cài đặt Local (Development)

Đầu tiên, clone mã nguồn về máy:
```bash
git clone https://github.com/HoanBuCon/Quiz-Website.git
cd Quiz-Website
```

### 5.1 Cài đặt Database (MySQL)
Dự án sử dụng **MySQL Database**. Bạn có thể dùng MySQL cài trực tiếp trên máy hoặc một máy chủ MySQL từ xa.

1. Tạo một cơ sở dữ liệu trống (ví dụ: `quiz_website`).
2. Import file SQL schema đã được cung cấp tại `quiz-backend/migration.sql`. Bạn có thể dùng phpMyAdmin, DBeaver, hoặc chạy lệnh CLI:
   ```bash
   mysql -u username -p quiz_website < quiz-backend/migration.sql
   ```
*(Lưu ý: Nếu bạn sử dụng `docker-compose.yml` đi kèm, hãy kiểm tra đảm bảo nó đang chạy MySQL thay vì PostgreSQL mặc định).*

### 5.2 Cài đặt Backend
```bash
cd quiz-backend
npm install

# Khởi tạo biến môi trường
cp .env.development.example .env
```
Mở tệp `quiz-backend/.env` và cập nhật thông tin kết nối MySQL (xem kỹ mục 5.4 bên dưới).

Khởi tạo cấu trúc và chạy backend:
```bash
# Tạo Prisma Client (nếu dự án code qua Prisma)
npm run prisma:generate

# Chạy server (mặc định http://localhost:4000)
npm run dev
```

### 5.3 Cài đặt Frontend
Mở một terminal mới tại thư mục gốc (`Quiz-Website`):
```bash
npm install

# Đảm bảo bạn có file .env với nội dung:
# REACT_APP_API_BASE_URL=http://localhost:4000

# Chạy frontend (mặc định http://localhost:3000)
npm start
```

### 5.4 Hướng dẫn Cấu hình Biến môi trường (.env)

Dưới đây là ý nghĩa và cách cấu hình các file `.env` mẫu có sẵn trong dự án:

**Cấu hình Frontend (`Quiz-Website/.env`):**
- Development (Local): Copy `.env.development.example` thành `.env`, chỉnh biến `REACT_APP_API_BASE_URL=http://localhost:4000` (để kết nối tới server dev backend).
- Production (Hosting): Copy `.env.production.example` sang `.env`, thiết lập `REACT_APP_API_BASE_URL=https://yourdomain.com/api` (Địa chỉ thật với HTTPS của backend).

**Cấu hình Backend (`quiz-backend/.env`):**
Copy `quiz-backend/.env.development.example` hoặc `quiz-backend/.env.production.example` thành file `.env` thực thụ.
- `DATABASE_URL`: Chuỗi kết nối MySQL chuẩn (`mysql://user:pass@host:3306/db`).
- `NODE_ENV`: Khai báo `development` (khi code local) hoặc `production` (khi đưa lên server).
- `JWT_SECRET`: Chuỗi khóa bảo mật bất kỳ, bắt buộc dùng để mã hóa đăng nhập.
- `CORS_ORIGIN`: Domain của Frontend (ví dụ `http://localhost:3000` hoặc `https://yourdomain.com`).
- `SMTP_*`: Tài khoản máy chủ email dùng để hệ thống gửi các mã OTP (như khôi phục mật khẩu).
- `GEMINI_API_KEY`: Mã khóa Google Gemini, cần thiết để chạy tính năng sinh câu hỏi AI.

## 6. Cài đặt Production (Triển khai)

### 6.1 Triển khai bằng Docker (Dùng trên VPS)
Nếu dùng VPS, bạn có thể triển khai nguyên cục (DB, Backend, Frontend) qua `docker-compose.yml`.
1. Đảm bảo cập nhật biến môi trường an toàn trong `docker-compose.yml` và `.env`.
2. Khởi tạo:
```bash
docker-compose up -d --build
```
Frontend chạy ở port `8082` và Backend ở `4000`. Cần cấu hình thêm Nginx proxy.

### 6.2 Triển khai lên cPanel
- **Database:** Tạo CSDL PostgreSQL trên cPanel và import schema, hoặc dùng một Remote DB.
- **Backend:**
  - Vào phần Node.js App trên cPanel, trỏ root vào thư mục `quiz-backend`.
  - File khởi động: `index.js`.
  - Thêm các biến ENV quan trọng (`NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`).
  - Dùng SSH hoặc Terminal cPanel chạy `npm install` và `npm run prisma:generate`.
- **Frontend:**
  - Sửa `.env` ở local thành: `REACT_APP_API_BASE_URL=https://yourdomain.com/api` (tùy URL backend).
  - Chạy build ở local: `npm run build`.
  - Upload file nén của thư mục tĩnh `build/` lên cPanel và giải nén vào thư mục `public_html/`.

## 7. Ghi chú
- Token JWT lưu ở LocalStorage (Header sẽ gọi `/auth/me` để lấy tên hiển thị)
- CORS: thêm cả domain có/không `www` nếu sử dụng
- Ảnh lưu tại `quiz-backend/public/uploads` (prod có thể đặt dưới `public_html/uploads` tùy map)

---

© LiemDai Website. For support, please open an issue or contact the repo owner.
