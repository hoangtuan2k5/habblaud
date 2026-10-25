# Điều khiển Antigravity ngay trong Habblaud — bản thử Windows, 25/10/2026

Đã xác minh gửi tin từ ô chat Habblaud vào đúng conversation Antigravity Desktop đang rảnh và đọc được
phản hồi ngay trong Habblaud. Không mở trang Remote Control bên ngoài và không tạo phiên CLI thay thế.

## Cách dùng

1. Mở Antigravity Desktop bằng cùng tài khoản Windows, rồi mở Habblaud.
2. Bấm nhân vật AGY. Ô gửi tin hoạt động cả khi phiên đang rảnh; terminal hiển thị prompt/phản hồi của phiên.
3. Gõ tin và gửi. “Đã gửi” nghĩa là Desktop đã nhận tin, không có nghĩa model đã hoàn tất tác vụ.
4. Nút **Dừng lượt AGY** gửi yêu cầu hủy lần chạy hiện tại; không đóng Desktop, không kết thúc các tác vụ nền.

Habblaud khôi phục các phiên thực gần đây (tối đa 24 giờ) từ transcript cục bộ và trạng thái do Desktop trả về.
Không tạo hook giả hay hoạt động giả để dựng nhân vật. Phiên đang rảnh được tiếp tục trong cùng conversation.

## Kết nối và giới hạn

- Bản này dành cho Antigravity Desktop native trên Windows; kiểm tra với EXE Desktop `2.26.0.0`.
- Nhận diện đúng tiến trình `language_server.exe` trong bản Desktop đã cài và tiến trình cha Antigravity,
  chỉ kết nối các listener loopback thuộc tiến trình đó. Xác thực hiện tại chỉ được dùng trong bộ nhớ server,
  không gửi xuống trình duyệt, không ghi vào báo cáo hoặc cấu hình.
- Trước khi gửi, kiểm tra conversation tồn tại và đọc cấu hình thực thi gần nhất. Gửi lại đúng cấu hình đó
  để giữ model/quyền công cụ; không dùng cấu hình mặc định khi thiếu thông tin. Phiên thiếu cấu hình bị từ chối.
- Nội dung hội thoại đi qua bộ che bí mật và giới hạn độ dài sẵn có của Habblaud. Transcript phải thuộc đúng
  conversation trong `%USERPROFILE%\.gemini\antigravity\brain`; từ chối đường dẫn khác/junction thoát ra ngoài.
- Hooks chỉ quan sát hoạt động và metadata transcript; PreToolUse giữ `allow`, giao cho chính sách hiện có.
- Không đổi chính sách phê duyệt, không thêm service/dependency, không dùng iframe hay trang điều khiển ngoài.
- Bộ đọc hỗ trợ USER_INPUT/PLANNER_RESPONSE đã xác minh; chưa dựng đầy đủ bản ghi công cụ, lịch sử mọi phiên
  hoặc tạo phiên Desktop mới. Cần Desktop đang mở; nhiều tiến trình Desktop trùng đường dẫn bị từ chối.
- Đây là dịch vụ nội bộ của Desktop, có thể thay đổi giữa các phiên bản, không phải API công khai ổn định.

## Kết quả chạy thật

Người dùng đã đồng ý dùng lại phiên kiểm tra trước đó. Nhận diện đúng phiên bằng thời gian tạo hội thoại
`2026-10-25T05:03:55Z`, xác nhận nó đang idle trước khi gửi.

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Xác thực cục bộ | Đạt | Không xác thực: HTTP 401; xác thực tiến trình hiện tại: HTTP 200 |
| Khôi phục phiên thật | Đạt | Desktop trả 2 conversation gần đây với trạng thái idle; không dựng sự kiện hook |
| Ô chat cho phiên idle | Đạt | Playwright xác nhận ô nhập bật, nút dừng tắt khi idle |
| Gửi từ giao diện Habblaud | Đạt | 25/10 16:30:42.963 +07, POST /api/messages trả 201; Desktop chấp nhận |
| Phản hồi đúng conversation | Đạt | 16:30:56.279 +07, khung assistant trong terminal hiển thị mã xác nhận đã yêu cầu |
| Không mở trang điều khiển ngoài | Đạt | Số link Remote Control trong giao diện: 0 |
| Model/quyền công cụ giữ nguyên | Đạt | SHA-256 cấu hình thực thi trước/sau lượt thật bằng nhau |
| Dừng lượt qua Windows Desktop thật | Chưa thử | Đã kiểm tra endpoint/guard/transport bằng test cô lập; chưa hủy lượt model thật |
| Câu hỏi AGY ngay trong Habblaud | Đạt trên Desktop thật | 25/10, 17:14:16 hiển thị câu hỏi đang chờ và đủ 3 lựa chọn; người dùng tự trả lời. 17:16:02 Desktop ghi bước 16 `DONE`, có completed interaction, không còn waiting, đã sinh bước tiếp theo |
| Duyệt/từ chối quyền chuẩn và lệnh | Đạt test cô lập, chưa thử yêu cầu quyền thật | Chỉ duyệt một lần; kiểm tra lại danh tính/nội dung yêu cầu trước khi gửi. Không suy từ thử câu hỏi thành duyệt lệnh thật |
| Tạo phiên mới, terminal tương tác, các dạng tương tác khác | Chưa triển khai | Vẫn xử lý trong Desktop |

Bằng chứng tại `dist/agy-local-research/`: `live-inline-result.json`, `ui-native-result.json`,
`config-comparison.json`, ảnh `inline-confirmation.png` chỉ chứa dòng phản hồi xác nhận.
Không lưu nội dung hội thoại thật hoặc thông tin xác thực vào báo cáo.

Typecheck và 111 test trong nhóm tập trung đã qua; 4 test Codex giả lập dùng shebang không áp dụng trên Windows.
Test mới bao phủ xác thực loopback, đúng session, giữ cấu hình, che lỗi nhạy cảm, thứ tự tin nhắn,
phiên idle/offline, guard Origin/quyền truy cập và khôi phục trạng thái thực.

## Bộ cài

Bản `Habblaud-Setup-1.0.3-win-x64-vi-agy-control-trial.exe` đã cài lúc 15:52 +07 là bản thử cũ dùng hook
trong lượt đang chạy và nút mở Remote Control. Bản `vi-direct-hooks.exe` còn cũ hơn.
Cả hai được giữ riêng; không dùng checksum của chúng để nhận diện Desktop Control mới.

Bộ cài cuối: `dist/windows/Habblaud-Setup-1.0.3-win-x64-vi-agy-desktop-control-trial.exe` (25.531.209 byte).

SHA-256: `068430901da258731148ed55c198a711ec95f8a1148ddffdb28001b5619f4d96`.
File checksum cùng tên, thêm `.sha256`; log build: `dist/windows/build-agy-desktop-control-final.log`.
Đã chạy `node scripts/check-windows-package.mjs` trên payload cuối, với HOME/USERPROFILE cô lập.

Đã cài chính EXE này ngày 25/10 khoảng 16:41 +07, installer exit 0. Sau cài, 97/97 file khớp payload,
7 file dữ liệu kiểm tra giữ nguyên SHA-256 và hook khác không đổi. Server đóng gói khớp byte với server
đã dùng trong phép thử Desktop thật. App mở lại thành công, health có nguồn Antigravity, một tiến trình
server và log lỗi rỗng. Playwright sau cài xác nhận locale `vi`, ô chat bật cho phiên idle,
khung hội thoại đọc được prompt/phản hồi và không có link điều khiển ra ngoài.

Bằng chứng cài: `dist/agy-desktop-package-20261025/install-verification.json`, `tested-build.json`,
`health-result.json`; kết quả UI sau cài tại `dist/agy-local-research/ui-native-result.json`.
Backup ứng dụng và hooks trước cài: `dist/agy-desktop-package-20261025/backup-installed/`, `hooks.before.json`.
Backup trước khi nạp bản native đầu tiên: `dist/agy-native-trial/backup-before-native/`.
Chưa commit hoặc push.

## Bổ sung câu hỏi và duyệt quyền, 17:16 +07

Nguyên nhân: bridge hội thoại chưa lấy `waitingSteps` và chưa gọi `HandleCascadeUserInteraction`.
Yêu cầu thật đang chờ là `requestedInteraction.askQuestion`, không phải `permission`; chỉ thêm nút cho phép
sẽ không xử lý được trường hợp người dùng báo. Bản sửa dùng lại thẻ câu hỏi/quyền hiện có, ánh xạ vị trí
lựa chọn sang ID gốc và kiểm tra lại yêu cầu trước khi gửi quyết định. Không tự chọn đáp án, không sửa quy tắc.
Yêu cầu được trả lời trong Desktop hoặc bị hủy sẽ biến mất khi đồng bộ tiếp theo.

Bằng chứng không chứa nội dung hội thoại: `dist/agy-permissions-20261025/ui-result.json`, `desktop-outcome.json`.
184 test tập trung đạt, 4 test Codex dùng executable shebang bỏ qua trên Windows. Typecheck và i18n đạt.
Backup trước cập nhật trực tiếp ứng dụng: `dist/agy-permissions-20261025/backup-installed/`.
Phần cập nhật này ban đầu nạp trực tiếp server/client vào bản đã cài để kiểm tra yêu cầu thật;
checksum EXE cũ ở trên không đại diện cho thay đổi quyền/câu hỏi.
