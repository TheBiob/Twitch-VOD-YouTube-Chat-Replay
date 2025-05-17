@echo off
:again
set /p youtube_id=Youtube Video Id: 
node process_chat_repository.js "--files=%youtube_id%"
set /p other=More? (y/n): 
if "%other%"=="y" goto again
