# Kill electron-vite and Electron processes
Get-Process | Where-Object { $_.ProcessName -match 'electron' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Remove stale Chromium singleton lock files
$appDirs = @(
    "$env:APPDATA\daymon",
    "$env:APPDATA\Daymon"
)
foreach ($dir in $appDirs) {
    Remove-Item "$dir\SingletonLock" -Force -ErrorAction SilentlyContinue
    Remove-Item "$dir\SingletonSocket" -Force -ErrorAction SilentlyContinue
    Remove-Item "$dir\SingletonCookie" -Force -ErrorAction SilentlyContinue
}
