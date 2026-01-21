# PROMPT: Chuẩn hóa hành vi BAN / UNBAN theo cấp Class → Quiz (Hierarchy-aware)

## 🎯 Vai trò
Bạn là **lập trình viên Fullstack giàu kinh nghiệm**.

Mục tiêu:
- Giữ nguyên logic gốc public/private
- Giữ nguyên access scope (CLASS / QUIZ)
- **Chuẩn hóa hành vi BAN / UNBAN theo thứ bậc (Hierarchy)**
- Tránh các thao tác UNBAN sai cấp gây bug logic

Sau mỗi thay đổi:
- BẮT BUỘC có **REVIEW + giải thích lý do thiết kế**

---

## 🧩 NGUYÊN TẮC CỐT LÕI (BẮT BUỘC)

### 🔒 BAN có phân cấp (Hierarchy)
- **BAN ở Class level**
  - Có hiệu lực cao nhất
  - Chặn toàn bộ Quiz con
- **BAN ở Quiz level**
  - Chỉ chặn Quiz đó
  - Không ảnh hưởng Quiz khác

👉 **BAN Class > BAN Quiz**

---

## 🐞 / YÊU CẦU MỚI  
### Hiển thị user bị BAN Class tại Quiz, nhưng KHÔNG cho UNBAN tại Quiz

---

## ❌ Hành vi hiện tại (chưa đúng)
- User bị BAN khỏi Class
- Tại Dashboard Quiz:
  - Có thể:
    - Không hiển thị user
    - Hoặc hiển thị nhưng vẫn cho UNBAN
- Điều này gây:
  - UNBAN sai cấp
  - Mâu thuẫn trạng thái access

---

## ✅ Hành vi MONG MUỐN (BẮT BUỘC)

### 1️⃣ Hiển thị
- Những user bị **BAN khỏi Class**:
  - VẪN được hiển thị:
    - Trong danh sách **BAN của từng Quiz**
  - Áp dụng cho:
    - Tất cả quiz (nếu user từng nhập ID Class)
    - Các quiz riêng lẻ (nếu user từng nhập ID Quiz)

👉 Mục đích:
- Owner nhìn thấy đầy đủ user đang bị chặn ở Quiz
- Tránh hiểu nhầm user “biến mất”

---

### 2️⃣ UNBAN tại Quiz (BỊ VÔ HIỆU)

- Với user bị **BAN tại Class**:
  - Nút **UNBAN tại Quiz**:
    - ❌ BỊ DISABLE
    - ❌ KHÔNG cho click
- Khi hover / focus vào nút UNBAN:
  - Hiển thị tooltip / nhãn:
    ```
    Phải UNBAN user này tại Class
    ```

---

### 3️⃣ UNBAN đúng cấp (BẮT BUỘC)

| Hành động | Kết quả |
|---------|--------|
| UNBAN tại Quiz | ❌ Không cho phép nếu user bị BAN Class |
| UNBAN tại Class | ✅ Gỡ toàn bộ hiệu lực BAN (Class + Quiz) |
| UNBAN Quiz khi KHÔNG bị BAN Class | ✅ Hợp lệ |

---

## 🧠 YÊU CẦU KỸ THUẬT

### Backend (Logic)
- Khi xử lý UNBAN Quiz:
  - Phải check:
    ```ts
    if (isBannedAtClassLevel(userId, classId)) {
      throw Forbidden("Must unban at Class level")
    }
    ```
- Trạng thái BAN Quiz:
  - Có thể tồn tại song song với BAN Class
  - Nhưng **BAN Class luôn được ưu tiên**

---

### Frontend (UI – `@EditClassPage.tsx`)
- Với mỗi user trong danh sách BAN của Quiz:
  - Nếu user bị BAN Class:
    - Disable nút UNBAN
    - Gắn tooltip rõ ràng
- UI **KHÔNG được cho phép**
  - Thao tác UNBAN sai cấp

---

## 🧠 QUY TẮC TỔNG HỢP (BẮT BUỘC)

| Trạng thái user | UNBAN tại Quiz | UNBAN tại Class |
|---------------|--------------|----------------|
| Bị BAN Quiz | ✅ | ❌ (không liên quan) |
| Bị BAN Class | ❌ | ✅ |
| Bị BAN cả Class & Quiz | ❌ | ✅ |
| Không bị BAN | — | — |

---

## 🔍 REVIEW BẮT BUỘC

Sau khi implement yêu cầu này, bạn PHẢI:
1. Giải thích vì sao cần hierarchy BAN
2. Mô tả rõ:
   - UI disable hoạt động thế nào
   - Backend chặn ra sao
3. Chỉ ra:
   - Bug nào được loại bỏ nhờ thiết kế này
4. Chứng minh:
   - Không còn UNBAN sai cấp
   - Trạng thái Dashboard nhất quán

---

## ✅ KẾT QUẢ MONG MUỐN

- BAN / UNBAN rõ ràng theo cấp
- Owner không thao tác sai logic
- UI & Backend đồng bộ
- Không phát sinh access “nửa vời”
- Dễ mở rộng trong tương lai (Role / Group)

---

**BẮT ĐẦU TRIỂN KHAI YÊU CẦU NÀY TRƯỚC.**
