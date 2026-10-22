# Windows installer (preview)

Build `dist/windows/Habblaud-Setup-<version>-win-x64-vi-direct-hooks.exe` with:

```sh
npm ci
npm run build:windows
node scripts/check-windows-package.mjs
```

Build requirements: Node 22.12+, npm and NSIS 3 (`makensis` in PATH, or set `MAKENSIS`). The same
build script can cross-build on Linux; set `NSISDIR` if using a locally extracted NSIS package.
It downloads the pinned official Node 24.22.1 Windows x64 executable, verifies its SHA-256 against
Node's HTTPS release manifest and includes Node's license. The installer has its own `.sha256` file.
Only application files are staged: no `.env`, credentials, conversations or host deployment config.

The per-user NSIS installer includes Vietnamese-only UI, Desktop/Start menu shortcuts, an
optional Startup shortcut, optional Antigravity hooks and an uninstaller. Installation is fixed at
`%LOCALAPPDATA%\Programs\Habblaud`; no admin rights or separate Node/Git/Docker are required.
Windows 10/11 x64 is the preview target; ARM64 and 32-bit runtimes are not supplied.

`launch.vbs` invokes `launcher.ps1` hidden. A per-session mutex serializes launches. The launcher
reuses a healthy local Habblaud or starts bundled Node, waits for health and opens the default browser.
Startup mode does not open a browser. Stop verifies the recorded PID's executable and script before
terminating it. Logs live under `%USERPROFILE%\.habblaud\desktop-logs`. The installer stops its running
server before replacing files. The uninstaller removes hooks only if they still reference its Node,
removes its shortcuts/files and keeps user history and agent accounts. Uninstallation failure to stop
an externally modified process may require closing it manually before removing the application.
If hook removal fails, uninstallation aborts before deleting application files to avoid dangling commands.

The server binds only to 127.0.0.1:4747, defaults activity text to Vietnamese, disables World and ignores
inherited remote-listener settings. The Windows build fixes the interface to Vietnamese, overriding saved/browser preferences; the standard build remains multilingual. Claude/Codex
observation uses the Windows user's existing sessions; advanced plugins and interactive PTYs are not
included. Agents inside WSL are separate. See `README.vi.txt` for customer instructions.

Verification on the Linux builder: production build/typecheck, Antigravity regression tests, PowerShell
parser, NSIS compilation and `check-windows-package.mjs`. The latter checks PE architecture, private-file
exclusion, real bundled hook install/uninstall and server/client startup using the host Node.
It does **not** execute Windows Node or test Windows installation. Before customer delivery, verify on
Windows: install with a Unicode/spaced username, launch twice, browser readiness, real Antigravity
hooks, logout/login autostart, Stop, upgrade and uninstall with user state preserved.

No code-signing certificate is configured. The executable is unsigned and may trigger SmartScreen;
don't label it a tested production Windows release until those manual checks pass.


The current Windows commands follow the handoff in `prompt-gemini-fix-habblaud.zip`: invoke bundled
Node directly, without an extra `cmd.exe` wrapper. Safe paths are unquoted, matching the supplied
Windows sample; paths with spaces or shell metacharacters are quoted individually. Variable-expansion
characters are rejected rather than silently generating an unsafe command. Three flat events are
registered (PreInvocation, PostInvocation, Stop), each with a ten-second timeout. Other hooks and
Linux/macOS registration are preserved. Tool-level activity is not registered in this Windows edition.

The handoff reports successful command tests on Windows against a mock HTTP server, and an actual
Antigravity log rejecting the old nested cmd wrapper. It explicitly does not establish successful
real Desktop-to-Habblaud dispatch. An HTTP 200 without a correlated real App event is not proof.
Do not restore the old wrapper or overwrite the whole hooks file using the supplied example.

## Windows documentation audit

- Microsoft documents special quote handling for `/c` and `/s`. Antigravity already launches a shell;
  the additional wrapper failed in the supplied application log and has been removed. This does not
  establish that forward slashes alone caused the previous failure.
- Windows PowerShell 5.1 interprets non-ASCII script text using the legacy code page without a BOM.
  The Vietnamese launcher and repair script therefore use UTF-8 with BOM; hook JSON remains UTF-8
  without BOM for JSON consumers. The desktop launcher explicitly uses `powershell.exe`, not `pwsh`.
- NSIS ExecWait with an exit variable requires checking both the error flag and the exit code.
  Upgrade/uninstall now abort if stopping the owned server fails, before replacing/removing files.
- Shortcuts require Windows Script Host/VBScript to be enabled. Managed machines may block scripts;
  no policy bypass beyond the individual PowerShell process is installed. No system policy is changed.

Sources: [Microsoft cmd](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd),
[PowerShell encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding),
[Start-Process](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process),
[wscript](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/wscript),
[NSIS ExecWait](https://nsis.sourceforge.io/Reference/ExecWait).


## Validate the installed customer build

Close Antigravity only after saving its work. Install the preview with the Antigravity hook option
selected, then reopen the actual Desktop project and start a new conversation. The `status` command
reports configuration presence only. Optional diagnostics require an empty marker file at
`%USERPROFILE%\.habblaud\antigravity-hook-debug`; they store only the latest invocation timestamp,
event, stage, HTTP status, accepted flag and workspace count. No prompt/transcript or tool arguments
are written to that diagnostic. `accepted: true` means Habblaud returned HTTP success and `{ok:true}`;
stdout `{}` and exit 0 are intentionally fail-open and are not evidence of delivery.

Correlate a new PreInvocation/PostInvocation/Stop in the App language-server log (the handoff used
`%APPDATA%\Antigravity\logs\language_server.log`) with a new diagnostic and the actual office state.
Do not manufacture an event in the live office to claim success. Confirm all three events, then turn
off diagnostics by removing the marker. Restore a config backup only after comparing current edits.

The `windows-hooks` CI job runs the real Windows shell test, including Unicode/spaced paths and stdin
forwarding. Until that job runs on the pushed revision it is pending; on Linux the test is skipped.
Even a passing Windows shell/mock-server test does not validate real Antigravity Desktop dispatch.
