# PROMPT: Mở rộng & SỬA LỖI cơ chế quản lý ID & Link truy cập cho Quiz-Website

## 🎯 Vai trò & Nguyên tắc
Bạn là **lập trình viên Fullstack giàu kinh nghiệm**.

Yêu cầu bắt buộc:
- Đọc hiểu **logic hiện tại**
- **KHÔNG phá logic gốc**
- Khi phát hiện hành vi sai → **sửa theo đúng yêu cầu mô tả**
- Sau mỗi task phải có **REVIEW & giải thích nguyên nhân bug**

---

## 🧩 TRẠNG THÁI HIỆN TẠI (TÓM TẮT)

- Class:
  - Có ID / Link truy cập
  - Có reset ID / Link
- Quiz:
  - Đang được mở rộng thêm ID / Link
- Hệ thống có:
  - Cơ chế BAN / UNBAN user
  - Nhưng tồn tại **2 BUG LOGIC NGHIÊM TRỌNG** (mô tả bên dưới)

---

## 🐞 BUG 1: Reset ID/Link KHÔNG gỡ quyền user cũ (BUG NGHIÊM TRỌNG)

### ❌ Hành vi hiện tại (SAI)
- Owner reset ID / Link (Class hoặc Quiz)
- Hệ thống generate ID / Link mới
- ❌ Nhưng:
  - Users đã từng nhập ID/Link cũ
  - Vẫn có thể:
    - Thấy Class / Quiz
    - Tiếp tục tham gia bình thường

### ✅ Hành vi MONG MUỐN (BẮT BUỘC)
- Khi Owner reset ID / Link:
  - **TOÀN BỘ users đã từng tham gia bằng ID/Link cũ phải bị gỡ quyền**
  - Class / Quiz:
    - Không còn hiển thị trong `ClassesPage` của user
- Nếu user muốn tham gia lại:
  - **BẮT BUỘC nhập lại ID / Link MỚI**

### 🧠 Yêu cầu kỹ thuật
- Reset ID / Link phải đồng nghĩa với:
  - Vô hiệu hóa **TOÀN BỘ access session cũ**
- Không được:
  - Chỉ đổi string ID
  - Mà vẫn giữ access mapping user ↔ class/quiz

👉 Gợi ý (không bắt buộc):
- Dùng `access_token_version`
- Hoặc `access_token_id` mới
- Access hợp lệ = `(user_id, token_id)` đang active

### 🔍 REVIEW SAU KHI SỬA BUG 1
- Vì sao bug này xảy ra?
- Bạn đã revoke access bằng cách nào?
- Có ảnh hưởng logic public/private không?

---

## 🐞 BUG 2: UNBAN user nhưng user KHÔNG thể quay lại (BUG LOGIC)

### ❌ Hành vi hiện tại (SAI)
1. Owner BAN user
   - User bị gỡ quyền → OK
2. Owner UNBAN user
   - ❌ User:
     - Không thấy lại Class / Quiz trong `ClassesPage`
     - Khi nhập lại ID / Link:
       - Bị báo **"Class Not Found"**

👉 Điều này xảy ra dù:
- ID / Link **CHƯA BỊ reset**
- User chỉ bị BAN tạm thời

---

### ✅ Hành vi MONG MUỐN (BẮT BUỘC)

#### Trường hợp 1: UNBAN + ID/Link CHƯA reset
- Ngay khi UNBAN:
  - User **phải thấy lại Class / Quiz**
  - Không cần nhập lại ID / Link
- Nếu user nhập lại ID / Link cũ:
  - Vẫn tham gia được bình thường

#### Trường hợp 2: UNBAN nhưng ID/Link đã reset
- User:
  - **KHÔNG được quay lại tự động**
  - Phải nhập ID / Link mới

👉 UNBAN ≠ reset access

---

### 🧠 Yêu cầu kỹ thuật (RẤT QUAN TRỌNG)

- BAN / UNBAN:
  - **KHÔNG được xoá vĩnh viễn access record**
- BAN chỉ là:
  - Trạng thái tạm thời: `is_banned = true`
- UNBAN:
  - Phải:
    - Khôi phục access cũ
    - Nếu token/version vẫn còn hiệu lực

❌ TUYỆT ĐỐI KHÔNG:
- Xoá access mapping khi BAN
- Khiến hệ thống hiểu user “chưa từng tham gia”

---

## 🧱 PHÂN TÁCH LOGIC BẮT BUỘC

| Hành động | Có reset token? | User có phải nhập lại ID? |
|---------|----------------|---------------------------|
| BAN | ❌ | ❌ |
| UNBAN | ❌ | ❌ |
| Reset ID/Link | ✅ | ✅ |
| Reset + UNBAN | ✅ | ✅ |

---

## 🧠 ACCESS MODEL ĐÚNG (BẮT BUỘC PHẢI TUÂN THEO)

Access hợp lệ khi:
```
user_access.token_id === current_token.id
AND user_access.is_banned === false
```
❌ Không được chỉ check:
`user_id ∈ class_users`


---

## 🔍 REVIEW BẮT BUỘC SAU KHI SỬA 2 BUG

Sau khi sửa, bạn PHẢI trình bày:
1. Root cause của từng bug
2. Những bảng DB bị ảnh hưởng
3. Flow mới khi:
   - Reset ID
   - BAN / UNBAN
4. Vì sao logic này không phá:
   - Public / Private
   - Quiz / Class hiện tại

---

## ✅ KẾT QUẢ MONG MUỐN

- Reset ID/Link = revoke toàn bộ access cũ
- UNBAN = khôi phục access nếu token còn hiệu lực
- Không còn:
  - User “ma” không thấy class
  - Class Not Found sai logic
- Access control:
  - Rõ ràng
  - Dễ debug
  - Dễ mở rộng

---

**BẮT ĐẦU SỬA TỪ BUG 1 → BUG 2.**
