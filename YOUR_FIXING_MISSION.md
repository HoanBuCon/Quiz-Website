# PROMPT: Chuẩn hóa & SỬA LOGIC Access Control cho Class / Quiz (Scope-based)

## 🎯 Vai trò
Bạn là **lập trình viên Fullstack giàu kinh nghiệm**.

Mục tiêu:
- Giữ nguyên logic gốc public/private
- Giữ nguyên cơ chế ID/Link đã thiết kế
- **SỬA & CHUẨN HÓA các lỗi access liên quan đến SCOPE (Class vs Quiz)**

Sau mỗi task / bug fix:
- Phải có **REVIEW + giải thích root-cause**

---

## 🧩 KHÁI NIỆM CỐT LÕI (BẮT BUỘC ÁP DỤNG)

### 🔑 Access có SCOPE
Access KHÔNG mặc định là toàn Class.

| Scope | Ý nghĩa |
|-----|--------|
| `CLASS` | User truy cập toàn bộ Class |
| `QUIZ` | User chỉ truy cập 1 Quiz cụ thể |

👉 Mọi access record **PHẢI gắn scope**

---

## 🐞 BUG / YÊU CẦU 1  
### Class rỗng sau khi reset Quiz ID vẫn hiển thị (SAI)

### ❌ Hành vi hiện tại
- User nhập ID/Link **Quiz**
- Owner reset toàn bộ ID/Link của Quiz đó
- User:
  - Mất quyền truy cập Quiz → OK
  - Nhưng tại `@EditClassPage.tsx`:
    - Vẫn thấy **Class**
    - Class rỗng (không còn quiz)

### ✅ Hành vi MONG MUỐN (BẮT BUỘC)
- Nếu user:
  - **KHÔNG có access Class**
  - Và **KHÔNG còn access Quiz nào thuộc Class**
- ⇒ **ẨN HOÀN TOÀN Class**

❌ Không được hiển thị Class rỗng

### 🧠 Yêu cầu kỹ thuật
- Class chỉ hiển thị với user nếu:
  - Có `CLASS access`
  - HOẶC có ≥ 1 `QUIZ access` còn hiệu lực trong class

---

## 🐞 BUG / YÊU CẦU 2  
### BAN Class nhưng vẫn nhập được ID Quiz (LOGIC MÂU THUẪN)

### ❌ Hành vi hiện tại
1. User nhập ID/Link Class → có access
2. Owner BAN user khỏi Class
3. User:
   - Không làm được quiz trong class → OK
   - Nhưng:
     - Nhập ID/Link Quiz
     - Hệ thống:
       - Vẫn ghi nhận access (hiển thị dashboard owner)
       - Nhưng user không truy cập được Quiz

### ❌ Đây là trạng thái SAI & MÂU THUẪN

---

### ✅ Hành vi MONG MUỐN (BẮT BUỘC)

- Nếu user bị **BAN ở scope CLASS**:
  - ❌ Không được truy cập Class
  - ❌ Không được truy cập BẤT KỲ Quiz nào trong Class
  - ❌ Không được nhập ID/Link Quiz để “lách”

👉 **BAN CLASS = chặn toàn bộ Quiz con**

### 🧠 Yêu cầu kỹ thuật
- Khi xử lý ID/Link Quiz:
  - Phải check:
    ```
    NOT EXISTS class_ban(user_id, class_id)
    ```
- Nếu bị BAN Class:
  - Không tạo access Quiz
  - Không hiển thị trên dashboard
  - Trả lỗi rõ ràng (403)

---

## 🐞 BUG / YÊU CẦU 3  
### User nhập ID Quiz nhưng lại có quyền toàn Class (SAI SCOPE)

### ❌ Hành vi hiện tại
- User nhập ID/Link **Quiz**
- Dashboard Owner:
  - Hiển thị user đó:
    - Ở Class
    - Ở TẤT CẢ quiz trong class

### ❌ Đây là lỗi nghiêm trọng về access scope

---

### ✅ Hành vi MONG MUỐN (BẮT BUỘC)

#### Trường hợp: User chỉ nhập ID/Link Quiz
- User:
  - ❌ KHÔNG có quyền Class
  - ✅ Chỉ có quyền Quiz đã nhập
- Dashboard Owner:
  - User chỉ xuất hiện:
    - Ở Quiz tương ứng
    - Và Class chứa quiz đó (để hiển thị quan hệ)
  - ❌ KHÔNG xuất hiện ở các Quiz khác

---

### 🔥 BAN từ Class (ảnh hưởng đặc biệt)

- Nếu Owner:
  - BAN user tại **Class level**
- Thì:
  - User mất:
    - Mọi quyền truy cập Quiz (kể cả quiz nhập lẻ)
  - Dù quiz đó được nhập bằng ID riêng

👉 **BAN Class > BAN Quiz**

---

## 🧠 QUY TẮC ƯU TIÊN (BẮT BUỘC)

| Quy tắc | Mô tả |
|------|------|
| BAN Class | Chặn toàn bộ Quiz |
| Quiz access | KHÔNG suy ra Class access |
| Reset Quiz ID | Chỉ revoke quiz đó |
| Không còn quiz access | Ẩn class |
| UNBAN Class | Khôi phục access cũ nếu token còn hiệu lực |

---

## 🧱 CHECK ACCESS ĐÚNG (BẮT BUỘC)

```ts
function canAccessQuiz(user, quiz) {
  if (isBannedFromClass(user, quiz.classId)) return false
  return hasValidQuizAccess(user, quiz.id)
}
