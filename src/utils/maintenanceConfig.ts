// File cấu hình trạng thái bảo trì của website

/**
 * HƯỚNG DẪN SỬ DỤNG:
 * 
 * 1. BẬT CHẾ ĐỘ BẢO TRÌ:
 *    - Đổi IS_MAINTENANCE_MODE = true
 *    - Website sẽ hiển thị trang bảo trì cho tất cả user
 * 
 * 2. TẮT CHẾ ĐỘ BẢO TRÌ (hoạt động bình thường):
 *    - Đổi IS_MAINTENANCE_MODE = false
 *    - Website hoạt động như bình thường
 * 
 * 3. WHITELIST (Tùy chọn):
 *    - Thêm địa chỉ IP vào MAINTENANCE_WHITELIST
 *    - Các IP này vẫn truy cập được khi bảo trì
 */

// ===== CẤU HÌNH CHÍNH =====
export const IS_MAINTENANCE_MODE = false; // true = Bật bảo trì | false = Tắt bảo trì

// ===== CẤU HÌNH BỔ SUNG =====

// Danh sách IP được phép truy cập khi đang bảo trì (dành cho admin/developer)
export const MAINTENANCE_WHITELIST: string[] = [
  // '127.0.0.1',        // localhost
  // '::1',              // localhost IPv6
  // '192.168.1.100',    // Ví dụ: IP của admin
];

// Thông điệp bảo trì tùy chỉnh
export const MAINTENANCE_MESSAGE = {
  brand: {
    text: "liemdai",
    logo: "/Trollface.png",
  },
  content: {
    title: "ĐANG BẢO TRÌ HỆ THỐNG",
    description: "Chúng tôi đang nâng cấp hệ thống để mang đến trải nghiệm tốt hơn cho bạn",
    estimatedTime: "Dự kiến hoàn thành trong vài ngày tới. Vui lòng quay lại sau!",
  },
};

// Video background cho trang bảo trì
export const MAINTENANCE_VIDEO_URL = '/videos/bg_video.mp4';

/**
 * Kiểm tra xem user có được phép bypass trang bảo trì không
 * @returns true nếu được phép bypass, false nếu phải vào trang bảo trì
 */
export const canBypassMaintenance = (): boolean => {
  if (!IS_MAINTENANCE_MODE) return true;
  
  // Kiểm tra localStorage có bypass key không (dành cho dev)
  try {
    const bypassKey = localStorage.getItem('maintenance_bypass');
    if (bypassKey === 'liemdai_dev_access_2024') {
      return true;
    }
  } catch (e) {
    // console.error('Cannot access localStorage:', e);
  }
  
  return false;
};

/**
 * Set bypass key vào localStorage để dev có thể truy cập khi bảo trì
 * Chạy trong console: window.setMaintenanceBypass()
 */
if (typeof window !== 'undefined') {
  (window as any).setMaintenanceBypass = () => {
    try {
      localStorage.setItem('maintenance_bypass', 'liemdai_dev_access_2024');
      // console.log('Maintenance bypass activated! Reload page to access.');
    } catch (e) {
      // console.error('Cannot set bypass key:', e);
    }
  };
  
  (window as any).clearMaintenanceBypass = () => {
    try {
      localStorage.removeItem('maintenance_bypass');
      // console.log('Maintenance bypass cleared!');
    } catch (e) {
      // console.error('Cannot clear bypass key:', e);
    }
  };
}

export default {
  IS_MAINTENANCE_MODE,
  MAINTENANCE_WHITELIST,
  MAINTENANCE_MESSAGE,
  canBypassMaintenance,
};