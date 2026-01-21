# PROMPT: Refactor UI/UX trang EditClassPage theo style ProfilePage

## 🎯 Vai trò
Bạn là **lập trình viên UI/UX giàu kinh nghiệm**.

## 🧩 Bối cảnh
Dự án hiện có trang **Thống Kê / ProfilePage (`ProfilePage.tsx`)** với:
- Hệ thống bảng (table)
- Nút (button)
- Màu sắc
- Spacing
- Typography

Trang này đã thể hiện **phong cách UI chuẩn của toàn bộ hệ thống**.

Nhiệm vụ của bạn là:
- Đọc hiểu **logic frontend UI** của `ProfilePage.tsx`
- Kế thừa và áp dụng **toàn bộ style đó** cho trang:
  - `EditClassPage.tsx`
- **KHÔNG thay đổi logic nghiệp vụ hiện tại** của `EditClassPage.tsx`

---

## 🎨 Yêu cầu thiết kế UI

### 1. Đồng bộ & tương đồng style
- Áp dụng lại từ `ProfilePage.tsx`:
  - Kiểu bảng (table layout, header, row)
  - Button style (primary / secondary / danger)
  - Màu sắc chủ đạo
  - Spacing & padding
  - Typography (font size, font weight)
- Không tạo style mới gây lệch hệ thống
- Giao diện phải nhìn là nhận ra cùng một sản phẩm

---

### 2. Clean & tinh gọn
- Giảm tối đa:
  - Border không cần thiết
  - Box lồng nhau gây rối mắt
- Ưu tiên:
  - Whitespace hợp lý
  - Phân cấp thị giác rõ ràng
- Giao diện hướng tới:
  - Dễ đọc
  - Dễ thao tác
  - Chuyên nghiệp

---

## 📱 Responsive Mobile (BẮT BUỘC)

### Yêu cầu
- Thiết kế lại layout **mobile-first** cho `EditClassPage.tsx`
- Mục tiêu:
  - **Tiết kiệm width**
  - Không bị tràn ngang
  - Không cần zoom để thao tác

### Gợi ý (không bắt buộc)
- Table → chuyển sang:
  - Card list
  - Hoặc row dạng stack
- Button:
  - Icon-only hoặc icon + text ngắn
- Các action:
  - Gom vào menu (`⋮`) nếu cần

---

## 🧹 Chỉnh sửa UI chi tiết

### CLASS BAN label
- Hiện tại:
  - Có border
  - Có background
- Yêu cầu mới:
  - ❌ Bỏ toàn bộ border
  - ❌ Bỏ background
  - ✅ Chỉ giữ:
    - Icon
    - Text
- Style phải:
  - Nhẹ
  - Không gây nhiễu thị giác
  - Phù hợp với tổng thể clean UI

---

## ⚠️ Ràng buộc quan trọng
- ❌ Không thay đổi logic frontend
- ❌ Không làm mất chức năng
- ❌ Không làm sai hành vi UI hiện tại
- Chỉ refactor:
  - Style
  - Layout
  - Responsive behavior

---

## ✅ Kết quả mong muốn
- `EditClassPage.tsx`:
  - Có style đồng bộ với `ProfilePage.tsx`
  - Clean, gọn, dễ dùng
  - Responsive tốt trên mobile
- UI có thể merge trực tiếp vào codebase mà không cần chỉnh lại logic

---

**BẮT ĐẦU THỰC HIỆN TỪ VIỆC PHÂN TÍCH ProfilePage.tsx.**
