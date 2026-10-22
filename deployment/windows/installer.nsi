Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!ifndef PAYLOAD
  !error "PAYLOAD must point to the staged Windows files"
!endif
!ifndef OUTPUT
  !error "OUTPUT must name the installer executable"
!endif
Name "Habblaud"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Habblaud"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$SYSDIR\wscript.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS '$\"$INSTDIR\launch.vbs$\" Open'
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${PAYLOAD}/LICENSE"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Vietnamese"
LangString AppSection ${LANG_VIETNAMESE} "Habblaud (bắt buộc)"
LangString StartupSection ${LANG_VIETNAMESE} "Tự chạy khi đăng nhập Windows"
LangString HooksSection ${LANG_VIETNAMESE} "Cấu hình hook Antigravity"

Function .onInit
  SetShellVarContext current
  System::Call 'kernel32::SetEnvironmentVariableW(w "HABBLAUD_LANG", w "vi") i.r0'
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Bộ cài yêu cầu Windows 10/11 x64."
    Abort
  ${EndIf}
FunctionEnd

Section "$(AppSection)" Main
  SectionIn RO
  SetShellVarContext current
  IfFileExists "$INSTDIR\launcher.ps1" 0 stopped
  ClearErrors
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\launcher.ps1" -Mode Stop' $0
  IfErrors stop_failed
  StrCmp $0 0 stopped
  stop_failed:
    MessageBox MB_ICONSTOP "Không dừng được Habblaud. Hãy đóng ứng dụng rồi chạy lại bộ cài."
    Abort
  stopped:
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}/*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Habblaud"
  CreateShortcut "$SMPROGRAMS\Habblaud\Habblaud.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs" Open'
  CreateShortcut "$DESKTOP\Habblaud.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs" Open'
  CreateShortcut "$SMPROGRAMS\Habblaud\Dừng Habblaud.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs" Stop'
  CreateShortcut "$SMPROGRAMS\Habblaud\Cài hook Antigravity.lnk" "$INSTDIR\runtime\node.exe" '"$INSTDIR\scripts\antigravity-install.mjs" install'
  CreateShortcut "$SMPROGRAMS\Habblaud\Gỡ Habblaud.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Habblaud" "DisplayName" "Habblaud"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Habblaud" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Habblaud" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Habblaud" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Habblaud" "NoRepair" 1
SectionEnd

Section /o "$(StartupSection)" Startup
  CreateShortcut "$SMSTARTUP\Habblaud.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs" Background'
SectionEnd

Section "$(HooksSection)" Hooks
  ClearErrors
  ExecWait '"$INSTDIR\runtime\node.exe" "$INSTDIR\scripts\antigravity-install.mjs" install' $0
  IfErrors 0 +2
    StrCpy $0 1
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION "Không cài được hook Antigravity. Hãy dùng shortcut trong Start để thử lại."
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  ClearErrors
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\launcher.ps1" -Mode Stop' $0
  IfErrors uninstall_stop_failed
  StrCmp $0 0 uninstall_stopped
  uninstall_stop_failed:
    MessageBox MB_ICONSTOP "Không dừng được Habblaud. Hãy đóng ứng dụng rồi gỡ lại."
    Abort
  uninstall_stopped:
  ClearErrors
  ExecWait '"$INSTDIR\runtime\node.exe" "$INSTDIR\scripts\antigravity-install.mjs" uninstall --owner "$INSTDIR\runtime\node.exe"' $0
  IfErrors uninstall_hooks_failed
  StrCmp $0 0 uninstall_hooks_removed
  uninstall_hooks_failed:
    MessageBox MB_ICONSTOP "Không gỡ được cấu hình hook Antigravity. Giữ lại ứng dụng để tránh hook trỏ vào file bị xóa. Hãy kiểm tra hooks.json rồi gỡ lại."
    Abort
  uninstall_hooks_removed:
  Delete "$DESKTOP\Habblaud.lnk"
  Delete "$SMSTARTUP\Habblaud.lnk"
  RMDir /r "$SMPROGRAMS\Habblaud"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Habblaud"
  # User history and agent accounts outside the install directory are preserved.
  RMDir /r "$INSTDIR"
SectionEnd
