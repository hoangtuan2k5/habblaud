param([ValidateSet('Open', 'Background', 'Stop')][string]$Mode = 'Open')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$node = Join-Path $root 'runtime\node.exe'
$server = Join-Path $root 'dist\server\index.js'
$state = Join-Path $env:USERPROFILE '.habblaud'
$logs = Join-Path $state 'desktop-logs'
$pidFile = Join-Path $logs 'server.pid'
$url = 'http://127.0.0.1:4747'
$mutex = New-Object System.Threading.Mutex($false, 'Local\HabblaudDesktopLauncher')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(20000) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Một lượt khởi động Habblaud khác chưa hoàn tất.' }
    if ($Mode -eq 'Stop') {
        if (Test-Path $pidFile) {
            $serverPid = [int](Get-Content $pidFile -Raw)
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
            if ($process -and $process.ExecutablePath -eq $node -and $process.CommandLine.Contains($server)) {
                Stop-Process -Id $serverPid -ErrorAction Stop
            }
            Remove-Item $pidFile -Force
        }
        return
    }
    function Test-Office {
        try {
            $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2
            return ($health.ok -eq $true -and $health.version -and $null -ne $health.sources)
        } catch { return $false }
    }
    if (-not (Test-Office)) {
        New-Item -ItemType Directory -Path $logs -Force | Out-Null
        # Keep the installed desktop office local even if the shell has remote settings.
        Get-ChildItem Env:HABBLAUD_REMOTE_* | Remove-Item
        $env:HABBLAUD_HOST = '127.0.0.1'
        $env:HABBLAUD_PORT = '4747'
        $env:HABBLAUD_IN_DOCKER = '0'
        $env:HABBLAUD_BIND = '127.0.0.1'
        $env:HABBLAUD_DATA_DIR = $state
        $env:HABBLAUD_LANG = 'vi'
        $env:HABBLAUD_WORLD = '0'
        $env:HABBLAUD_ALLOWED_HOSTS = ''
        $env:HABBLAUD_PTY = '0'
        $env:PATH = (Join-Path $root 'runtime') + ';' + $env:PATH
        $process = Start-Process -FilePath $node -ArgumentList ('"' + $server + '"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'server.log') -RedirectStandardError (Join-Path $logs 'server-error.log')
        Set-Content -Path $pidFile -Value $process.Id -Encoding ASCII
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if ($process.HasExited) { throw "Không khởi động được Habblaud. Xem $logs\server-error.log. Cổng 4747 có thể đang được sử dụng." }
            if (Test-Office) { $ready = $true; break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw "Habblaud chưa sẵn sàng. Xem $logs\server-error.log." }
    }
    if ($Mode -eq 'Open') { Start-Process $url }
} catch {
    $message = $_.Exception.Message
    (New-Object -ComObject WScript.Shell).Popup($message, 0, 'Habblaud', 16) | Out-Null
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
