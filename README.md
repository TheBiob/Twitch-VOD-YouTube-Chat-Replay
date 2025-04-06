# Twitch VOD replay for YouTube

## Why?
Because Twitch decided to limit highlights to 100 hours so I can no longer preserve my VODs there and simply exporting them to YouTube would mean losing the chat history.

I could render the chat replay onto the video itself but 1) I don't really like that and 2) I would lose the ability to easily search through messages and jump to the relevant points in the VOD. I wanted a solution that preserves the functional value of having a chat replay separate from the VOD itself and couldn't really find anything so I made it myself.

### How it works
Currently it's a simple browser extension (tested on current latest Chrome and Firefox) that adds an external chat similar to the one you would have when watching streams on YouTube. As you navigate YouTube it checks if the current video has a chat replay hosted in [this GitHub repository](https://github.com/TheBiob/twitch-chat-storage), if it finds chat information for the current video in there it will display the messages as they were posted during the stream, similar to highlights on Twitch.

## Can I use this myself?
The extension has a settings page where you can add other repositories as sources, check out the **chat_storage_scripts/** folder for scripts to set that up.

Since it uses a git repository to fetch the chat data it has to grab the entire chat history for a video at once, which means it likely doesn't scale well for bigger streams with lots of messages. The biggest chat history I tested with around 1000 messages still worked fine on my end however.

I'll add instructions on how to set this up once I have the scripts for it written and tested.

## Current features
 - Display chat messages as they appeared on stream
 - Messages contain a timestamp that can be clicked on to jump to the relevant point in the video
 - Standard Twitch badges will be displayed next to the user
 - User names link to their relevant twitch pages
 - Twitch as well as third party (FFZ, BTTV and 7TV) emotes, can be enabled/disabled in the settings, third-party emotes handled using [@mkody/twitch-emoticons](https://github.com/mkody/twitch-emoticons)
 - Supports dark and light YouTube themes

## Building
This extension uses webpack and npm to handle it's dependencies. To build, clone or download the code then run

    npm install

to install all dependencies followed by

    npm run build

which will create a dist/ folder with all the built code and a zip file containing said folder. You can install the zip file directly as a browser extension.

**Note on Firefox**

Standard Firefox does not allow installing unsigned extensions, either use the developer, nightly or extended suppport releases of Firefox which have an option to disable requiring extensions to be signed or wait until I submit this which I may or may not do at some point. You can load it as a temporary add-on via about:debugging, however it will be disabled again if you restart Firefox.

### Development
If you want to make changes to the extension, run the following command to create a non-minimized build of the extension. You can then load the dist/ folder directly in your browser

     npm run watch

This will make webpack watch for changes and automatically update the dist/ folder. For some changes you may need to reload the extension in the browser.

## TODOs
 - Improve documentation of scripts to automate downloading, formatting and pushing chat history files
 - More settings for the extension
    - Readable colors
    - Chat layout
    - Enable/disabled badges
 - VOD chapters
 - Popout chat
 - Transparent on-video chat
