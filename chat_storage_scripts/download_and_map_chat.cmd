@echo off
:again
set /p twitch_id=Twitch Video Id: 
set /p youtube_id=Youtube Video Id: 
set RAW_DIRECTORY=./chat_repository/raw

REM echo .\TwitchDownloaderCLI.exe chatdownload --id "%twitch_id%" --embed-images true --output "%RAW_DIRECTORY%/%youtube_id%.json" --collision Rename
.\TwitchDownloaderCLI.exe chatdownload --id "%twitch_id%" --embed-images true --output "%RAW_DIRECTORY%/%youtube_id%.json" --collision Rename
node process_chat_repository.js "--files=%youtube_id%"
set /p other=More? (y/n): 
if "%other%"=="y" goto again
