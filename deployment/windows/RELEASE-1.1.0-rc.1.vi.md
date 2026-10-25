# Bàn giao Habblaud 1.1.0-rc.1 — Windows

Ngày kiểm tra: 25/10/2026, múi giờ +07. Đây là bản thử nghiệm, chưa ký số.

## Lỗi và bản sửa

- Hook Windows cũ lồng `cmd.exe`, gây lỗi command. Bộ cài dùng Node trực tiếp, đường dẫn theo máy,
  quote khi cần, timeout 10 giây và giữ nguyên các hook khác.
- Build Windows lỗi wildcard NSIS/encoding tiếng Việt: sửa wildcard, buộc NSIS đọc UTF-8;
  bộ kiểm tra i18n xử lý CRLF và test shell có timeout phù hợp.
- Hội thoại AGY hiển thị envelope `USER_REQUEST`/`ADDITIONAL_METADATA`: parser chỉ bỏ envelope ngoài
  do Desktop thêm, giữ định dạng và các tag thực sự nằm trong nội dung.
- Hội thoại điều khiển chưa nhận yêu cầu tương tác: bridge đọc `waitingSteps`, dùng lại thẻ quyền/câu hỏi,
  kiểm tra lại yêu cầu trước `HandleCascadeUserInteraction` và ánh xạ lựa chọn sang ID gốc.
  Câu hỏi thật lúc 17:11 có `requestedInteraction.askQuestion`, nên chỉ xử lý `permission` không đủ.

Các file chính: `server/sources/antigravity/{desktop,source,terminal}.ts`,
`server/permissions/{registry,http}.ts`, `server/messages/{registry,http}.ts`, `server/index.ts`,
`client/src/ui/{permission,composer,composer-model,drawer}.ts`, các test tương ứng và locale.
Build/installer: `scripts/build-windows.mjs`, `scripts/check-windows-package.mjs`,
`scripts/i18n-check.ts`, `deployment/windows/installer.nsi`.
Release: `.github/workflows/release.yml`, `scripts/release.ts`, package/version và changelog.

## Kết quả thực tế

| Hạng mục | Kết quả | Bằng chứng / giới hạn |
| --- | --- | --- |
| Câu hỏi thật xuất hiện trong Habblaud | Đạt | 17:14:16, 1 câu hỏi, đủ 3 lựa chọn gốc và ô trả lời khác; chưa tự gửi quyết định |
| Người dùng trả lời qua Habblaud → Desktop | Đạt | Người dùng xác nhận đã thử; 17:16:02 Desktop ghi bước 16 DONE, completed interaction, waiting=0, có bước tiếp theo |
| Gửi/đọc hội thoại trong cùng phiên Desktop | Đạt ở bản native trước | Xem `ANTIGRAVITY-CONTROL-TRIAL.vi.md`; sau cài RC ô chat phiên idle bật, đọc được hội thoại |
| Duyệt/từ chối lệnh và quyền chuẩn | Test cô lập đạt; chưa thử thực tế | Test chặn thẻ cũ, kiểm tra đúng phiên/bước/nội dung, chỉ scope once, không thay cấu hình |
| Hủy lượt AGY đang chạy | Chưa thử thực tế | Endpoint/guard/transport đã có test; không suy từ test câu hỏi |
| Typecheck / i18n | Đạt | 3000/3000 chuỗi ở mỗi locale |
| Nhóm test tích hợp tập trung | Đạt | 184 đạt, 4 test Codex dùng executable shebang bỏ qua trên Windows; các test bổ sung UI/release cũng đạt |
| Toàn bộ test Windows | Chưa đạt | Lần chạy rộng trước đó: 1876 đạt, 17 lỗi, 18 bỏ qua; lỗi chủ yếu quyền file POSIX/shebang/path. Không ẩn lỗi bằng skip để phát hành |
| Build EXE và kiểm tra payload | Đạt | NSIS exit 0; `node scripts/check-windows-package.mjs`, HOME/USERPROFILE cô lập |
| Cài chính EXE RC | Đạt | 17:22:23, exit 0, 97/97 file khớp payload, 7 file dữ liệu giữ nguyên SHA-256, các hook khác không đổi |
| UI sau cài RC | Đạt | 17:23:01, locale vi dù trình duyệt en-US, chat idle bật, không có link điều khiển ra ngoài; health version 1.1.0-rc.1, permissions=true |
| Gỡ cài, autostart, mở hai lần, shortcut Stop | Chưa kiểm tra lại trên RC | Kết quả bản installer trước nằm trong `VERIFICATION-2026-10-25.vi.md` |
| GitHub Actions | Chưa chạy hosted | YAML và cú pháp shell đã kiểm tra; chờ duyệt commit/push/tag. Job publish đợi cả Linux và Windows đạt |

Không dùng sự kiện giả vào văn phòng thật. Các test transport dùng dữ liệu và server cô lập,
không được coi là bằng chứng Desktop thật. Không lưu prompt, transcript hoặc thông tin xác thực vào báo cáo.

## EXE và khôi phục

Tệp: `Habblaud-Setup-1.1.0-rc.1-win-x64-vi-direct-hooks.exe`, 25.529.701 byte.

SHA-256: `366b4303056b79d85c69bb83a77e3ebd6b7b48a13ad15b98d36eac9c4c8ec0b9`.

Có tại `dist/windows/` và `C:\Users\hoang\Downloads\`, kèm file `.sha256`.
Đã cài cho tài khoản hiện tại. Để cài máy khác: chạy EXE, chọn tích hợp Antigravity nếu cần,
mở shortcut Habblaud và Antigravity Desktop trong cùng tài khoản Windows.

Backup ứng dụng trước cập nhật quyền: `dist/agy-permissions-20261025/backup-installed/`.
Backup hooks trước cài EXE: `dist/agy-permissions-20261025/hooks.before.json`.
Nếu cần khôi phục ứng dụng, dừng bằng shortcut Stop trước rồi phục hồi thư mục `dist` từ backup;
không xóa dữ liệu `.habblaud` hoặc ghi đè toàn bộ hooks nếu đã có thay đổi khác sau đó.

Bằng chứng: `dist/agy-permissions-20261025/{ui-result,desktop-outcome,install-verification,ui-native-result}.json`,
`tests.log`, `build-windows.log`. Build local hiện mang commit bb4a4d5 và dirty=true, đúng trạng thái chưa commit.

## Phát hành

Workflow kiểm tra tag khớp package/changelog và thuộc main, chạy full suite Linux, nhóm tích hợp Windows,
build/check gói, tải EXE/SHA-256/README.vi/build.json lên bản nháp rồi mới công khai.
Tag có hậu tố prerelease tạo GitHub prerelease. Bản đã công khai được giữ nguyên khi chạy lại.
`npm run release` chỉ tạo/push tag; workflow chịu trách nhiệm phát hành để tránh release thiếu EXE.

Repo GitHub đã kiểm tra bằng API: `hoangtuan2k5/habblaud`, main, Actions bật; chưa có release/run hiện tại.
Chưa commit, push, tạo tag hoặc release theo yêu cầu chờ duyệt ban đầu.

Conventional Commit đề xuất: `feat(windows): ship Antigravity controls and automated releases`.
