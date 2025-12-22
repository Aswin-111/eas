# show-files.ps1
# Usage:
#   ./show-files.ps1 "C:\path\to\folder"
#   or just ./show-files.ps1  (to use the current folder)

param (
    [string]$FolderPath = "."
)

# Resolve absolute path safely
try {
    $FullPath = Resolve-Path $FolderPath -ErrorAction Stop
} catch {
    Write-Host "Error: Folder not found - $FolderPath" -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "=== Showing files in: $($FullPath.Path) ===" -ForegroundColor Cyan
Write-Host ""

# Get all files recursively
$files = Get-ChildItem -Path $FullPath -File -Recurse

if (-not $files) {
    Write-Host "No files found in $FullPath" -ForegroundColor Red
    exit
}

foreach ($file in $files) {
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "FILE: $($file.FullName)" -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
    try {
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
        Write-Host $content -ForegroundColor White
    } catch {
        Write-Host "⚠️ Could not read file (maybe binary): $($file.Name)" -ForegroundColor Red
    }
    Write-Host "`n"
}
