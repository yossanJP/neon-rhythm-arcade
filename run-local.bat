@echo off
echo Starting local web server...
echo Access http://localhost:8000 in your browser.
start http://localhost:8000
python -m http.server 8000
pause
