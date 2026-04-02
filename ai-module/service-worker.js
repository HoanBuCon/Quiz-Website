// service-worker.js

// Sự kiện này được kích hoạt khi service worker được kích hoạt.
self.addEventListener('activate', event => {
  // clients.claim() yêu cầu service worker kiểm soát trang ngay lập tức.
  event.waitUntil(self.clients.claim());
});

// Sự kiện này được kích hoạt khi người dùng nhấp vào một thông báo.
self.addEventListener('notificationclick', event => {
  // Đóng cửa sổ thông báo.
  event.notification.close();

  // Logic này sẽ focus vào cửa sổ ứng dụng hiện có hoặc mở một cửa sổ mới.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Nếu một cửa sổ cho ứng dụng đã mở, hãy focus vào nó.
      if (clientList.length > 0) {
        let client = clientList[0];
        // Cố gắng tìm một client đang được focus để ưu tiên.
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      // Nếu không có cửa sổ nào đang mở, mở một cửa sổ mới đến trang gốc của ứng dụng.
      return self.clients.openWindow('/');
    })
  );
});
