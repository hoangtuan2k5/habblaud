# Kiểm tra Windows và Antigravity Desktop — 24–25/10/2026

Đã chạy bộ cài EXE trên Windows thật và nhận hai lượt Antigravity Desktop do người dùng thực hiện.
Đây vẫn là bản preview: chưa kiểm tra đăng xuất/đăng nhập, tài khoản Windows có tên Unicode/khoảng trắng,
và log Desktop không ghi rõ từng lần hook thành công. Không coi các mục đó là đã đạt.

## Môi trường và nguồn

- Windows x64, 25H2, build 26200.9711; môi trường Windows native, không phải WSL.
- Antigravity Desktop: EXE ngày 24/10 ghi `2.24.0.0`, lúc kiểm tra cuối ngày 25/10 ghi `2.26.0.0`;
  đường dẫn `%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe`.
- Node máy build `24.4.0`, npm `11.4.2`; Node đóng gói `24.22.1`; NSIS `3.13`.
- Launcher chạy bằng Windows PowerShell `5.1.26100.9711`. Dùng `npm.cmd` vì máy chặn `npm.ps1`;
  không thay đổi execution policy hay chính sách phê duyệt công cụ.
- Shell kiểm tra cuối là PowerShell `7.6.7`; launcher vẫn gọi Windows PowerShell 5.1.
- Repo ban đầu sạch, `main` và `origin/main` cùng `bb4a4d5d50cb0ec025dfb1ba8f8a5c781cdbbba9`.
- Bản cài trước đó cùng phiên bản `1.0.3` nhưng `dist/build.json` ghi `327da1d`, `dirty:true`,
  build ngày 21/10. SHA-256 hook cũ là `39161cfa6272a6a501710b9038cea7ab1aae11665edcd5eea290b2a8c18b526c`.
  Bản mới ghi `bb4a4d5`, `dirty:true` vì chứa bản sửa chưa commit; hash hook khớp nguồn:
  `7fc039b8c6220605411499d257d71282e6ca7d9c1598410b7f352e79a326357b`.

## Lỗi tái hiện và bản sửa

1. **Build NSIS trên Windows, 24/10 khoảng 19:13–19:14 +07:**
   `npm.cmd run build:windows` dừng ở `installer.nsi:53`, báo `File ... payload/* -> no files found`.
   Đổi wildcard sang `${PAYLOAD}\*`. Build sau đó tạo EXE cài được.
2. **Encoding bộ cài:** NSIS mặc định đọc `installer.nsi` dưới dạng `ACP` dù nguồn là UTF-8.
   Truyền `-INPUTCHARSET UTF8`; đã quan sát wizard, tên thành phần và màn hình hoàn tất tiếng Việt.
3. **Test dịch trên Windows, 24/10 19:12 +07:** `server/test/i18n.test.ts` lệch hai khóa trợ giúp nhiều dòng:
   bộ quét đọc CRLF nhưng JavaScript chuẩn hóa literal xuống LF. Chuẩn hóa xuống dòng khi quét nguồn,
   thêm test hồi quy CRLF/CR. Hai test đọc đĩa/chạy shell được cấp 20 giây; timeout tiến trình con vẫn 10 giây.

Không sửa hook hoạt động, payload, chính sách phê duyệt, World, transcript hay terminal.

File thay đổi: `deployment/windows/installer.nsi`, `scripts/build-windows.mjs`, `scripts/i18n-check.ts`,
`server/test/antigravity-hook.test.ts`, `server/test/i18n.test.ts`, `CHANGELOG.md` và báo cáo này.

## Bảng kiểm tra

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| `npm.cmd ci` | Đạt | 119 package; audit không phát hiện lỗ hổng |
| `npm.cmd run typecheck` | Đạt | Hai project TypeScript |
| Bốn file test được yêu cầu | Đạt | 18/18 test, không skip; gồm shell Windows với Unicode, khoảng trắng và stdin |
| `npm.cmd run i18n:check -- vi` | Đạt | 2989/2989 khóa |
| `npm.cmd run build:windows` | Đạt | Build native, NSIS 3.13, EXE và `.sha256` |
| `node scripts/check-windows-package.mjs` | Đạt | PE x64, loại dữ liệu riêng tư, cài/gỡ hook và server/client độc lập |
| Nâng cấp bản cũ | Đạt | Installer exit 0; build metadata và hash hook được thay bằng bản mới |
| Nâng cấp khi server đang chạy | Đạt | PID trước thử 13536; installer exit 0, server dừng và cổng được giải phóng |
| Cài mới sau gỡ | Đạt | Wizard tiếng Việt; lần cài silent cuối exit 0 |
| Shortcut Desktop/Start và mở hai lần | Đạt | Desktop chuyển hướng qua OneDrive có đường dẫn `Máy tính`; localhost hoạt động, một server Node |
| Tiếng Việt dù browser/saved locale là English | Đạt | `en-US`, saved `en`, HTML `vi`; DOM có “Tiếng Việt” |
| Shortcut Stop | Đạt | Server dừng, PID file được xóa, cổng 4747 đóng |
| Tùy chọn Startup | Đạt một phần | Chọn trong wizard; shortcut được tạo với `launch.vbs Background`; chạy shortcut khởi động được server |
| Đăng xuất/đăng nhập Windows thật | Chưa kiểm tra | Không gián đoạn các ứng dụng/công việc đang mở |
| Gỡ cài đặt và giữ dữ liệu | Đạt | Exit 0; EXE, shortcut và registry được gỡ; 5 file names/stats/timeline giữ nguyên SHA-256 khi lấy mẫu lúc server dừng |
| Giữ hook khác | Đạt | So sánh JSON trước/sau; chỉ nhóm Habblaud bị cài/gỡ |
| Hook JSON, Node/script, timeout | Đạt | Ba command trực tiếp; đường dẫn tồn tại; timeout 10; hash hook khớp repo |
| Ba sự kiện từ Desktop thật | Đạt | Hai lượt người dùng xác nhận; từng sự kiện có diagnostic riêng HTTP 200, `accepted:true` |
| Health có nguồn Antigravity | Đạt | `provider:antigravity`, `sessions:1`, `ok:true` |
| Giao diện cập nhật trực tiếp | Đạt | DOM Playwright ghi `working` rồi `idle`; nhân vật và thông báo hoàn thành đã được quan sát |
| Log Desktop ghi rõ từng hook thành công | Chưa xác minh | File language-server đang được ghi, nhưng không có dòng PreInvocation/PostInvocation/habblaud |
| Cài dưới tài khoản Unicode/khoảng trắng | Chưa kiểm tra | Chỉ test shell Unicode/khoảng trắng và shortcut Desktop qua thư mục có dấu; không thay thế test toàn bộ tài khoản |
| CI, ký số, toàn bộ test suite, cross-build Linux sau sửa | Chưa kiểm tra | Chỉ chạy các check tập trung nêu trên; EXE chưa ký số |

## Đối chiếu lượt Desktop thật

Mốc bắt đầu thu diagnostic: `2026-10-24T12:21:50.336Z` (19:21:50 +07).
Không tạo POST hoặc agent giả vào văn phòng thật. Test HTTP mô phỏng được chạy riêng và không dùng làm bằng chứng Desktop.

| Lượt | PreInvocation được chấp nhận | PostInvocation được chấp nhận | Stop được chấp nhận |
|---|---|---|---|
| 24/10, người dùng xác nhận vừa gửi lượt mới | 19:24:27.574 +07 | 19:24:33.677 +07 | 19:24:33.981 +07 |
| 25/10, sau cài lại bản cuối, người dùng xác nhận đã gửi | 12:03:55.676 +07 | 12:04:00.785 +07 | 12:04:01.175 +07 |

Cả sáu response đều `status:200`, `accepted:true`, `workspaces:1`.
DOM giao diện lượt cuối: 12:03:55.868 `working`, 12:04:01.442 `idle`, locale `vi`, browser `en-US`, saved locale `en`.
API và giao diện cùng cập nhật; không suy ra ba sự kiện từ một file Stop cuối cùng.
Log đang được ghi là `%APPDATA%\Antigravity\logs\language_server.log` (25/10 12:04:36 +07);
log không có dòng dispatch thành công nên tiêu chí log riêng còn thiếu, không được báo là đạt.

## Bằng chứng và sao lưu trên máy kiểm tra

Thư mục gốc: `dist/windows/verification-20261024/` (bị Git ignore, không đưa dữ liệu máy vào commit).

- `backup/hooks.before.json`: bản hooks trước sửa; `backup/Habblaud/`: toàn bộ ứng dụng đã cài trước thử.
- Backup do installer tạo thêm: `%USERPROFILE%\.gemini\config\hooks.json.habblaud-backup-20261024-192154`.
- `diagnostics.jsonl`: từng thay đổi diagnostic, chỉ metadata; bản Stop lỗi trước mốc thử được giữ nhưng không tính là thành công.
- `office.jsonl`, `ui-live.jsonl`, `ui.json`: trạng thái Antigravity và kết quả locale, không lưu nội dung hội thoại.
- `antigravity-row.png`: ảnh riêng hàng Antigravity hoàn thành; không chụp phần tiêu đề hội thoại của agent khác.
- `state-stopped-before-uninstall.json`: manifest SHA-256 của dữ liệu trước vòng gỡ có server dừng.
- `build-windows.log`: log build sau sửa. Diagnostic đã tắt sau khi hoàn tất thu thập; server bản mới được để chạy.

Sau các phép thử, đã cài lại mặc định: hook bật, Startup không bật (giống trạng thái trước kiểm tra).
Không sửa/xóa thư mục tài khoản agent; phép so hash dữ liệu chỉ bao phủ 5 file Habblaud nêu trên,
không phải phép so hash toàn bộ tài khoản Claude/Codex/Antigravity.

## Bàn giao

EXE: `dist/windows/Habblaud-Setup-1.0.3-win-x64-vi-direct-hooks.exe`.

SHA-256: `5e2daa82d180b044ecf4db382f816b94f43d95ddfcd044700fdd2e4007a68611`.

Chạy EXE bằng tài khoản Windows dùng Antigravity, giữ chọn hook, hoàn tất và mở shortcut Habblaud.
Nếu Antigravity đã mở trước khi đổi hooks, lưu công việc rồi thoát/mở lại Desktop; bắt đầu một lượt mới.
Giao diện tại `http://127.0.0.1:4747`; dừng qua Start > Habblaud > Dừng Habblaud.

Đề xuất commit: `fix(windows): repair native NSIS build and CRLF translation checks`.
Chưa commit/push; chờ người dùng duyệt. Các mục chưa kiểm tra ở trên phải được xử lý trước khi gọi đây là bản phát hành Windows đã kiểm thử đầy đủ.
