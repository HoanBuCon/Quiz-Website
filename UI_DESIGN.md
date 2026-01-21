# PROMPT: Tinh chỉnh UI/UX trang ProfilePage

## 🎯 Vai trò
Bạn là **UI/UX Designer giàu kinh nghiệm**, có khả năng đọc và hiểu mã nguồn frontend React/TypeScript.

## 🧩 Phạm vi
- Trang: `ProfilePage.tsx`
- Phạm vi chỉnh sửa: **UI/UX & style**
- ❌ Không thay đổi logic nghiệp vụ
- ❌ Không làm mất chức năng hiện có

---

## 🛠️ YÊU CẦU CHỈNH SỬA CỤ THỂ

### 1️⃣ Tắt hiệu ứng hover scaling (Banner & Avatar)

#### ❌ Hành vi hiện tại
- Khi hover:
  - Banner bị scale
  - Avatar bị scale
- Gây:
  - Mất tập trung
  - Cảm giác UI không đủ “clean”

#### ✅ Yêu cầu mới
- **Loại bỏ hoàn toàn hiệu ứng hover scaling** đối với:
  - Avatar
  - Banner
- Vẫn giữ:
  - Hiệu ứng hover khác nếu có (opacity, shadow nhẹ…) nhưng **KHÔNG scale**

---

### 2️⃣ Căn chỉnh Avatar tròn chính xác (UI polish)

#### ❌ Vấn đề hiện tại
- Avatar tròn:
  - Không nằm chính giữa border tròn
  - Khoảng cách giữa avatar và border không đều
- Gây cảm giác lệch, thiếu tinh tế

#### ✅ Yêu cầu mới
- Avatar phải:
  - Nằm **chính giữa tuyệt đối**
  - Khoảng cách tới border tròn **đều 360°**
- Ưu tiên:
  - Dùng flex/grid centering
  - Tránh hard-code margin lệch

👉 Mục tiêu: cảm giác **cân đối – cao cấp – chuẩn chỉnh**

---

### 3️⃣ Bổ sung Search & Sort cho container “Danh sách quyền truy cập”

#### 📦 Khu vực áp dụng
- Container: **Danh sách quyền truy cập**

---

#### 🔍 SearchBar
- Thêm **SearchBar** phía trên danh sách
- Chức năng:
  - Tìm theo **tên user**
- UX:
  - Placeholder rõ ràng
  - Không chiếm quá nhiều chiều cao

---

#### 🔃 Button Lọc / Sắp xếp
- Thêm nút **Lọc / Sort**
- Các chế độ sắp xếp bắt buộc:
  1. **Tên A → Z**
  2. **Ngày tham gia gần nhất**
  3. **Ngày tham gia sớm nhất**

- UX:
  - Có icon gợi ý (↕, A–Z, clock…)
  - Có trạng thái active rõ ràng

---

## 🎨 Yêu cầu UI/UX chung
- Giữ phong cách:
  - Clean
  - Gọn
  - Đồng bộ với UI hiện tại
- Không làm layout bị chật hoặc rối
- Các control mới phải:
  - Dễ hiểu
  - Dễ thao tác
  - Phù hợp desktop & mobile

---

## ⚠️ Ràng buộc quan trọng
- ❌ Không chỉnh sửa business logic
- ❌ Không làm thay đổi dữ liệu backend
- Chỉ tập trung:
  - UI
  - UX
  - Interaction
  - Style

---

## ✅ Kết quả mong muốn
- ProfilePage:
  - Không còn hover scaling gây nhiễu
  - Avatar cân đối, chuẩn chỉnh
  - Danh sách quyền truy cập:
    - Có Search
    - Có Sort rõ ràng
    - Dễ quản lý khi danh sách dài

---

**BẮT ĐẦU TỪ VIỆC PHÂN TÍCH ProfilePage.tsx.**
