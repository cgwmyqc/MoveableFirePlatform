@echo off
echo Starting local server...

:: 打开新的终端窗口运行 npx serve
start cmd /k "cd /d C:\Users\admin\Desktop\control_app\dist && npx serve"

:: 等待服务器启动（可按需调整秒数）
timeout /t 3 >nul

:: 打开默认浏览器访问 localhost:3000
start http://localhost:3000
