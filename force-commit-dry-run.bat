@echo off
"%~dp0node.exe" "%~dp0force-commit.js" --dry-run --verbose %*
pause
