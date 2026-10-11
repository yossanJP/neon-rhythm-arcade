@echo off
setlocal
cd /d "%~dp0"

REM Prefer the Windows Python launcher, then the python command.
py -3 --version >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=py -3"
    goto :start_server
)
python --version >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=python"
    goto :start_server
)
echo.
echo Python is not installed or could not be found.
echo Please install Python 3 from https://www.python.org/downloads/
echo Then run this file again. Make sure "Add Python to PATH" is checked.
echo.
pause
exit /b 1

:start_server
echo.
echo Opening the game at http://localhost:8000/
echo Keep this black window open while playing.
echo Close it to stop the server.
echo.
start "" "http://localhost:8000/"
%PY_CMD% -m http.server 8000 --bind 0.0.0.0
if errorlevel 1 (
    echo.
    echo Failed to start. Port 8000 may already be in use.
    pause
)
