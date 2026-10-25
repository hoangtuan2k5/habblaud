# Lịch sử phát hành Habblaud

Ghi chú tiếng Việt dùng để xuất bản GitHub Release. Mỗi phiên bản mới phải có mục riêng trước khi tạo tag.

## [Chưa phát hành]

## [1.1.0-rc.2] - 2026-10-25

Habblaud dành cho Windows x64, giao diện và bộ cài tiếng Việt. Đây là bản thử nghiệm tích hợp
Antigravity Desktop, chưa ký số.

### Tính năng mới

- **Hội thoại AGY ngay trong Habblaud:** đọc hội thoại của phiên thật, gửi tin nhắn vào cùng phiên kể cả
  khi đang rảnh, không cần mở trang điều khiển bên ngoài. Kết nối qua dịch vụ cục bộ có xác thực của Desktop;
  thông tin xác thực chỉ nằm trong tiến trình máy chủ.
- **Trả lời câu hỏi và yêu cầu quyền:** câu hỏi hiển thị các lựa chọn gốc trong Habblaud. Các yêu cầu lệnh
  và quyền chuẩn được hỗ trợ có thể cho phép một lần hoặc từ chối. Kiểm tra lại đúng phiên, bước và nội dung
  trước khi gửi quyết định; không tự duyệt hoặc thay đổi quy tắc cấp quyền.
- **Theo dõi hoạt động thật:** hook nhận sự kiện từ Antigravity, cập nhật nhân vật và trạng thái trong văn phòng.
  Khi khởi động lại, cầu nối Windows khôi phục các phiên Desktop gần đây; phiên không hoạt động quá 24 giờ được loại bỏ.
- **Bộ cài Windows x64:** kèm Node, shortcut mở/dừng Habblaud và tùy chọn khởi động khi đăng nhập.
  Tích hợp hook AGY là tùy chọn, sao lưu cấu hình và giữ nguyên các hook khác.
- **Tiếng Việt cố định trong bản Windows:** giao diện vẫn dùng tiếng Việt dù trình duyệt là tiếng Anh hoặc
  trước đó đã lưu tùy chọn English; hỗ trợ phông chữ, dấu tiếng Việt, ngày và số theo `vi-VN`.
- **Phát hành tự động:** tag phiên bản kích hoạt GitHub Actions kiểm tra Linux/Windows, build và kiểm tra gói,
  sau đó xuất bản EXE, SHA-256, hướng dẫn tiếng Việt và thông tin build. Tag thử nghiệm tạo GitHub prerelease.

### Lỗi đã sửa

- Lệnh hook Windows gọi Node trực tiếp, bỏ lớp `cmd.exe` lồng nhau từng gây lỗi nhận diện lệnh.
  Đường dẫn theo máy, đặt ngoặc kép khi cần và giữ timeout 10 giây cho `PreInvocation`, `PostInvocation`, `Stop`.
- Hội thoại chỉ hiển thị nội dung người dùng, bỏ lớp bọc `USER_REQUEST` và metadata do Desktop thêm;
  giữ nguyên định dạng và các tag nằm trong nội dung thật.
- Sửa wildcard và cách đọc UTF-8 của NSIS; chuẩn hóa CRLF trong kiểm tra bản dịch và điều chỉnh timeout test Windows.
- Launcher tiếng Việt tương thích Windows PowerShell 5.1. Dừng nâng cấp/gỡ cài nếu không thể dừng đúng máy chủ
  hoặc không thể gỡ cấu hình hook, tránh xóa dữ liệu khi thao tác thất bại.
- Đồng bộ phiên bản package, marketplace và plugin, khắc phục lỗi CI của bản `rc.1`.

### Kết quả kiểm tra

- [CI](https://github.com/hoangtuan2k5/habblaud/actions/runs/40184896817) và
  [workflow phát hành](https://github.com/hoangtuan2k5/habblaud/actions/runs/40184899695) đã đạt:
  Linux 1911 test đạt, 3 bỏ qua; nhóm tích hợp Windows 185 đạt, 4 bỏ qua do test Codex dùng executable shebang.
  Test shell Windows với đường dẫn có khoảng trắng và Unicode thực sự chạy.
- Đã gửi/nhận hội thoại và trả lời câu hỏi qua Antigravity Desktop thật. Sau khi người dùng trả lời trong
  Habblaud, Desktop ghi nhận bước hoàn tất và phiên tiếp tục.
- Đã tải chính EXE từ release, đối chiếu SHA-256 rồi cài thực tế. Giao diện tiếng Việt hoạt động,
  dữ liệu đã kiểm tra và các hook khác được giữ nguyên.

### Tải và chạy

1. Tải `Habblaud-Setup-1.1.0-rc.2-win-x64-vi-direct-hooks.exe` trong phần tệp đính kèm.
2. Chạy bộ cài, chọn tích hợp Antigravity nếu cần.
3. Mở shortcut Habblaud và Antigravity Desktop trong cùng tài khoản Windows.

SHA-256 của EXE:

```text
c637bc2a1671848a12d532b381e597a2a624040ecebe9d93a251d189032c8550
```

`build.json` ghi commit `d7a6e4b34b4396a022e956ff6f5d462d4a30b847`, `dirty=false`.

### Giới hạn đã biết

- Duyệt lệnh/quyền chuẩn và hủy lượt đang chạy đã có test cô lập nhưng chưa thử với Desktop thật;
  không suy từ luồng câu hỏi đã thành công sang các nhánh này.
- Chưa có terminal tương tác, tạo phiên mới, thống kê token hay hỗ trợ đầy đủ subagent AGY.
  Các dạng tương tác chưa hỗ trợ vẫn xử lý trong Desktop; AGY chưa được đưa vào Habblaud World.
- Bộ cài chưa ký số. Kết quả các test cô lập không thay thế kiểm chứng Desktop thật.
