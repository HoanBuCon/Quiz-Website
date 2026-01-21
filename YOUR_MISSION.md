# PROMPT: Nâng cấp cơ chế quản lý ID & Link truy cập cho Quiz-Website

## 🎯 Vai trò & Bối cảnh
Bạn là **một lập trình viên Fullstack giàu kinh nghiệm** (Frontend + Backend + Database Design).

Nhiệm vụ của bạn là:
- Đọc hiểu **toàn bộ mã nguồn dự án Quiz-Website**
- Phân tích kiến trúc hiện tại (Frontend, Backend, Database)
- Thiết kế và triển khai **cơ chế quản lý ID/Link truy cập nâng cao** cho Class và Quiz

⚠️ **Yêu cầu bắt buộc**:  
Sau **mỗi task lớn**, bạn **phải tự đánh giá (review)**:
- Đã làm gì
- Ảnh hưởng đến hệ thống
- Những thay đổi về Database / API / UI
- Rủi ro tiềm ẩn (nếu có)
- Đề xuất cải tiến tiếp theo (nếu cần)

---

## 🧩 Tổng quan hệ thống hiện tại
Website hiện có các tính năng:
- Tạo **Lớp học (Class)**
- Tạo **Quiz** trong Lớp học
- Chia sẻ Class / Quiz thông qua **ID** hoặc **Link truy cập**
- Mỗi Class và Quiz hiện tại chỉ có **1 ID/Link duy nhất và cố định**

❌ **Hạn chế hiện tại**:
- Owner (chủ lớp / chủ quiz) **không thể Reset ID/Link**
- Khi ID/Link bị lộ → không có cách thu hồi quyền truy cập

---

## 🚀 MỤC TIÊU CẢI TIẾN

### 🧱 TASK 1: Reset ID & Link truy cập cho Class / Quiz

#### 🎯 Yêu cầu chức năng
- Owner của **Class / Quiz** có thể:
  - Reset (đặt lại) **ID truy cập**
  - Reset (đặt lại) **Link truy cập**
- Mỗi lần Reset:
  - ID & Link **cũ bị vô hiệu hóa hoàn toàn**
  - Người dùng (học viên) đang dùng ID/Link cũ sẽ:
    - Bị **ngắt quyền truy cập ngay lập tức**
- ID & Link mới:
  - Được **generate random**
  - **Không được trùng lặp** với bất kỳ ID/Link nào đã từng tồn tại

#### 📍 Vị trí UI
- Dashboard quản lý ID/Link truy cập phải được đặt tại:
  - `#EditClassPage.tsx`

#### 🗄️ Database
- Có thể (và được khuyến khích) **thiết kế thêm bảng mới** để:
  - Quản lý quyền truy cập
  - Theo dõi trạng thái ID/Link
  - Lưu lịch sử reset (nếu cần)

#### 🔍 Sau khi hoàn thành TASK 1, hãy REVIEW:
- Database thay đổi những bảng nào?
- API mới / API bị chỉnh sửa?
- Logic revoke quyền truy cập hoạt động ra sao?
- Có edge case nào chưa xử lý?

---

### 🧱 TASK 2: Dashboard quản lý truy cập (Access Control)

Mở rộng Dashboard tại `#EditClassPage.tsx` với các chức năng sau:

#### ✅ Chức năng bắt buộc
1. **Reset ID & Link truy cập**
2. **Xem danh sách users (học viên)** đang có quyền truy cập thông qua:
   - ID hiện tại
   - Link hiện tại
3. **BAN (chặn truy cập)**:
   - Chặn một hoặc nhiều user cụ thể
   - User bị BAN:
     - Không thể truy cập Class / Quiz
     - Dù ID/Link vẫn còn hiệu lực

#### 🔁 Logic đặc biệt khi Reset ID/Link
- Khi Owner **Reset ID/Link**:
  - Toàn bộ users bị BAN trước đó sẽ được **UNBAN tự động**
- ⚠️ Trường hợp edge-case quan trọng:
  - Nếu hệ thống random **trùng lại ID/Link cũ**
  - → Những user từng bị BAN bởi ID/Link cũ **vẫn phải được UNBAN**

👉 Điều này đồng nghĩa:
- BAN phải gắn với **phiên bản ID/Link**
- Không được BAN vĩnh viễn theo user

#### 🗄️ Database
- Có thể cần:
  - Bảng `access_tokens`
  - Bảng `access_permissions`
  - Bảng `banned_users`
  - Hoặc cơ chế versioning cho ID/Link

#### 🔍 Sau khi hoàn thành TASK 2, hãy REVIEW:
- Cách bạn đảm bảo UNBAN đúng logic
- Cách bạn tránh conflict khi ID trùng
- Hiệu năng khi Class có nhiều users
- Tính mở rộng trong tương lai

---

### 🧱 TASK 3: Chuẩn hóa định dạng ID truy cập

#### 📌 Định dạng ID mới (BẮT BUỘC)
`LIGMA<TEXT_RANDOM><NUMBER_RANDOM>`

#### 🔢 Chi tiết
- `LIGMA` : tiền tố cố định
- `<TEXT_RANDOM>` :
  - Độ dài: **7 ký tự**
  - Chỉ gồm chữ cái **A–Z**
- `<NUMBER_RANDOM>` :
  - Độ dài: **3 chữ số**
  - Từ `000` đến `999`

#### ✅ Ví dụ hợp lệ

#### ❌ Không hợp lệ
- Thiếu tiền tố
- Sai độ dài
- Có ký tự đặc biệt
- Trùng ID đã tồn tại

#### 🔍 Sau khi hoàn thành TASK 3, hãy REVIEW:
- Thuật toán generate ID
- Xác suất trùng lặp
- Cách bạn đảm bảo uniqueness ở DB level

---

## 🧠 YÊU CẦU VỀ CÁCH LÀM VIỆC CỦA MÔ HÌNH

- Thực hiện **tuần tự từng TASK**
- **Không nhảy cóc**
- Sau mỗi TASK:
  - Phải có **mục REVIEW riêng**
- Khi cần thay đổi Database:
  - Mô tả rõ **schema**
  - Giải thích **lý do thiết kế**
- Khi viết code:
  - Ưu tiên clean code
  - Dễ mở rộng
  - An toàn (security-aware)

---

## ✅ KẾT QUẢ MONG MUỐN
- Owner toàn quyền kiểm soát truy cập Class / Quiz
- ID/Link có thể thu hồi & reset an toàn
- Hệ thống access control rõ ràng, mở rộng tốt
- Code & Database có khả năng scale trong tương lai

---

**BẮT ĐẦU THỰC HIỆN TỪ TASK 1.**
