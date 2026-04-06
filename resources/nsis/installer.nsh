 !macro customUnInstall
   DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Curtin"
 !macroend