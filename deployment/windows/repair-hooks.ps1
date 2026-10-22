$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'Programs/Habblaud'
$node = Join-Path $root 'runtime/node.exe'
$hook = Join-Path $root 'mod/habblaud-antigravity/hook.mjs'
foreach ($path in @($node, $hook)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Không tìm thấy tệp Habblaud: $path" }
}
$file = Join-Path $env:USERPROFILE '.gemini/config/hooks.json'
if (-not (Test-Path -LiteralPath $file)) { throw 'Không tìm thấy cấu hình hook đã cài.' }
$config = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
$group = [ordered]@{ enabled = $true }
# Match the direct invocation in the supplied Windows handoff; do not add a second cmd shell.
function Quote-HookPath([string]$Path) {
    $native = $Path.Replace('/', '\')
    if ($native -match '["%!?$`\x00-\x1f]') { throw 'Đường dẫn chứa ký tự không hỗ trợ trong lệnh hook Windows.' }
    if ($native -match '^[\p{L}\p{M}\p{N}_:.\\/-]+$') { return $native }
    return '"' + $native + '"'
}
foreach ($event in @('PreInvocation', 'PostInvocation', 'Stop')) {
    $command = '{0} {1} {2} 4747' -f (Quote-HookPath $node), (Quote-HookPath $hook), $event
    $group[$event] = @(@{ type = 'command'; command = $command; timeout = 10 })
}
$config | Add-Member -MemberType NoteProperty -Name 'habblaud-antigravity' -Value $group -Force
$backup = "$file.before-desktop-repair-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
Copy-Item -LiteralPath $file -Destination $backup
$json = $config | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText("$file.tmp", $json, (New-Object System.Text.UTF8Encoding($false)))
Move-Item -LiteralPath "$file.tmp" -Destination $file -Force
$state = Join-Path $env:USERPROFILE '.habblaud'
New-Item -ItemType Directory -Path $state -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $state 'antigravity-hook-debug') -Force | Out-Null
Write-Host "Đã sửa riêng nhóm Habblaud. Bản sao lưu: $backup"
Write-Host 'Thoát hẳn Antigravity bằng Quit/Exit (kể cả khay hệ thống), mở lại và tạo cuộc trò chuyện mới trong một dự án.'
Write-Host 'Đây là cách thử tương thích, chưa xác nhận sửa được lỗi bộ nạp hook của Desktop.'
