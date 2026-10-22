HABBLAUD — BẢN THỬ NGHIỆM WINDOWS 10/11 X64

1. Chạy Habblaud-Setup-…-win-x64-vi-direct-hooks.exe bằng tài khoản Windows dùng cho các agent.
   Không cần cài Node, Git hoặc Docker. Không cần quyền quản trị.
2. Có thể chọn “Tự chạy khi đăng nhập Windows” và cài hook Antigravity.
3. Mở shortcut Habblaud trên Desktop. Ứng dụng chạy nền rồi mở
   http://127.0.0.1:4747 trong trình duyệt mặc định.
4. Bản khách hàng này cố định tiếng Việt, kể cả khi trình duyệt dùng tiếng Anh.
5. Hook được chọn cài mặc định. Sau khi cài, thoát hẳn Antigravity (kể cả khay hệ thống),
   mở lại và bắt đầu lượt mới. Không cần tìm menu Hooks. Cần cài Antigravity riêng.
   Bản Windows đăng ký ba sự kiện theo cấu hình bàn giao: PreInvocation, PostInvocation, Stop.
   Agent chạy trong WSL là môi trường khác, không được bản này tự kết nối.
6. Dừng: Start menu > Habblaud > Dừng Habblaud.
   Khi tự chạy cùng Windows, ứng dụng chạy nền và không tự mở tab trình duyệt.
7. Gỡ: Settings > Apps > Habblaud. Dữ liệu tại %USERPROFILE%\.habblaud
   và tài khoản agent được giữ lại. Gỡ hook Habblaud trước khi xóa tệp ứng dụng.

GIỚI HẠN BẢN THỬ
- Theo dõi phiên Claude/Codex trên cùng tài khoản Windows và hoạt động hook Antigravity.
- Antigravity Windows hiện hiển thị hoạt động bắt đầu/kết thúc lượt; chưa có tên công cụ,
  lịch sử phản hồi, nhắn tin hay điều khiển quyền qua Habblaud.
- Chưa kèm terminal PTY tương tác và bộ cài plugin Claude/Codex; các tích hợp nâng cao
  cần cấu hình riêng. Không có icon khay hệ thống, dùng shortcut Stop để dừng.
- Chưa ký số; Windows SmartScreen có thể cảnh báo. Chỉ cài tệp do người quản lý tin cậy cung cấp.
- Máy chủ chỉ mở trên loopback, không tự công khai ra mạng và tắt Habblaud World.
- Lỗi khởi động: xem %USERPROFILE%\.habblaud\desktop-logs\server-error.log.
- Bản này được đóng gói trên Linux; phải thử cài/chạy/gỡ trên Windows thật trước khi giao khách.

ĐỐI CHIẾU BẢN SỬA
- Lệnh hook gọi Node trực tiếp, không lồng thêm cmd.exe /d /s /c.
- Đường dẫn có khoảng trắng được đặt trong ngoặc kép; không dùng cố định tên người dùng.
- Lệnh kiểm tra status chỉ xác nhận có cấu hình, không khẳng định App đã gọi hook.
- Chẩn đoán accepted:true cần được đối chiếu với sự kiện mới trong log App thật.
  POST thủ công hoặc test với máy chủ giả lập không chứng minh toàn luồng Desktop.
