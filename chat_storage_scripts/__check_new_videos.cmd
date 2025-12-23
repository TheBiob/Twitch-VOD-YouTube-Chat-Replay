@echo off
node sync_user_videos.js && goto new
echo No new video mappings found or an error occurred
goto :end
:new
cd chat_repository/
git status
set /p commit=New mappings found, commit? (y/n) 
if "%commit%" EQU "y" (
    git add .
    git commit -m "Add videos"
    git push
) ELSE (
    echo New settings were not pushed
)
:end
pause
