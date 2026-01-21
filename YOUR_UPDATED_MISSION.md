# PROMPT: Mở rộng cơ chế quản lý ID & Link truy cập cho Quiz-Website

## 🎯 Vai trò & Bối cảnh
Bạn là **một lập trình viên Fullstack giàu kinh nghiệm**.

Nhiệm vụ của bạn:
- Đọc hiểu **toàn bộ mã nguồn dự án Quiz-Website**
- Phân tích logic hiện có tại `#EditClassPage.tsx`
- **Giữ nguyên toàn bộ logic gốc**
- Thiết kế & triển khai **tính năng quản lý ID/Link truy cập cho QUIZ**
  dựa trên cơ chế đã có của CLASS

⚠️ **LƯU Ý CỰC KỲ QUAN TRỌNG**
- Hiện tại:
  - ✅ CLASS đã có quản lý ID/Link truy cập
  - ❌ QUIZ **CHƯA CÓ** reset / quản lý ID/Link
- Bạn **KHÔNG được giả định** rằng quiz đã có sẵn logic này
- Nhiệm vụ của bạn là **MỞ RỘNG**, không phải sửa lại

---

## 🧩 Trạng thái hệ thống HIỆN TẠI

### ✅ Đã tồn tại
- Class:
  - Có ID / Link truy cập
  - Có logic public / private
- Quiz:
  - Có public / private
  - ❌ KHÔNG có ID / Link riêng
  - ❌ KHÔNG có reset ID / Link

### 📍 Trang trọng tâm
- `#EditClassPage.tsx`
  - Đã có:
    - Logic public/private cho Class
    - Logic public/private cho Quiz
    - Quản lý ID/Link cho Class
  - Chưa có:
    - Dashboard quản lý ID/Link cho Quiz

---

## 🧠 LOGIC GỐC BẮT BUỘC GIỮ NGUYÊN (KHÔNG ĐƯỢC PHÁ)

Trang `#EditClassPage.tsx` hiện hoạt động theo **4 case logic public/private sau**:
```
Case 1: Class private, owner set public class
- Các quiz con đều phải được public
- Owner có thể set private/public lẻ các quiz con

Case 2: Class private, owner set public quiz
- Tự động set public class
- Chỉ quiz được chọn được public
- Các quiz còn lại giữ nguyên private
- Owner có thể set private/public lẻ các quiz con

Case 3: Class public, owner set private class
- Toàn bộ quiz đều bị set về private

Case 4: Class public, owner set private quiz
- Chỉ quiz được chọn bị set private
- Các quiz khác giữ nguyên
```


### ⚠️ Yêu cầu bắt buộc
- Bạn **PHẢI mô tả lại logic trên bằng lời**
- Phải chỉ rõ:
  - Logic này đang được áp dụng **TRƯỚC KHI** thêm ID/Link cho Quiz
- Mọi tính năng ID/Link mới cho Quiz:
  - **KHÔNG được làm thay đổi hành vi trên**

👉 Có thể coi:
- Public/Private = **Access Layer 1**
- ID/Link truy cập = **Access Layer 2 (mới thêm cho Quiz)**

---

## 🚀 MỤC TIÊU MỞ RỘNG

## 🧱 TASK 1: Phân tích & trích xuất logic quản lý ID/Link của CLASS

### 🎯 Mục tiêu
- Đọc code hiện tại để xác định:
  - ID/Link Class được generate thế nào
  - Reset hoạt động ra sao
  - DB đang lưu ID/Link Class ở đâu
- **KHÔNG chỉnh sửa logic class**

### 🔍 REVIEW SAU TASK 1
- Luồng reset ID/Link Class
- API liên quan
- DB schema liên quan
- Những điểm có thể tái sử dụng cho Quiz

---

## 🧱 TASK 2: Thiết kế quản lý ID & Link truy cập cho QUIZ (MỚI)

### 🎯 Yêu cầu chức năng (CHƯA TỒN TẠI TRƯỚC ĐÂY)
- Mỗi Quiz có:
  - ID truy cập riêng
  - Link truy cập riêng
- Owner có thể:
  - Reset ID Quiz
  - Reset Link Quiz
- Khi reset:
  - ID/Link cũ của Quiz **bị vô hiệu hóa**
  - User đang làm quiz bằng link cũ → **bị ngắt quyền**

### 📍 UI
- Dashboard quản lý ID/Link Quiz:
  - Được tích hợp vào `#EditClassPage.tsx`
  - Gắn theo từng Quiz
  - Không ảnh hưởng UI quản lý Class

### 🔗 Ràng buộc với logic public/private
- Quiz **private**:
  - Chỉ truy cập được qua ID/Link hợp lệ
- Quiz **public**:
  - Có thể truy cập công khai
  - ID/Link vẫn có thể dùng để kiểm soát

⚠️ Logic public/private **KHÔNG bị thay đổi**

---

## 🧱 TASK 3: Dashboard quản lý truy cập Quiz

### 🎛️ Tính năng
- Reset ID/Link Quiz
- Xem danh sách user đang truy cập Quiz
- BAN / UNBAN user theo **ID/Link version của Quiz**

### 🔁 Reset behavior
- Reset ID/Link Quiz:
  - Toàn bộ user bị BAN trước đó → UNBAN
- BAN **KHÔNG vĩnh viễn**
- BAN gắn với **version ID/Link của Quiz**

---

## 🧱 TASK 4: Chuẩn hóa định dạng ID truy cập (Áp dụng ID truy cập của Quiz), ID truy cập của Class giữu format cũ

### 📌 Format
SUGMA<TEXT_RANDOM><NUMBER_RANDOM>

- Prefix: `SUGMA`
- Text random: 7 ký tự A–Z
- Number random: 3 chữ số

### 🔍 REVIEW
- Collision handling
- DB constraint
- Retry strategy

---

## 🧠 YÊU CẦU VỀ CÁCH LÀM VIỆC

- Làm **theo đúng thứ tự TASK**
- Không giả định Quiz đã có reset ID/Link
- Sau mỗi TASK:
  - Có **REVIEW bắt buộc**
- Khi mở rộng logic:
  - Phải chỉ rõ:
    - Kế thừa từ Class
    - Phần nào là mới

---

## ✅ KẾT QUẢ MONG MUỐN
- Class: giữ nguyên behavior hiện tại
- Quiz: có quản lý ID/Link độc lập
- Không phá logic 4 case public/private
- Access control rõ ràng, dễ scale

---

**BẮT ĐẦU TỪ TASK 1.**

