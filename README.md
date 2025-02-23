# Twitch VOD replay for YouTube

### Why?
Because Twitch decided to limit highlights to 100 hours so I can no longer preserve my VODs there and simply exporting them to YouTube would mean losing the chat history.

I could render the chat replay onto the video itself but 1) I don't really like that and 2) I would lose the ability to easily search through messages and jump to the relevant points in the VOD. I wanted a solution that preserves the functional value of having a chat replay separate from the VOD itself and couldn't really find anything so I made it myself.

### How it works
Currently it's a simple Chrome extension that adds an external chat similar to the one you would have when watching streams on YouTube. As you navigate YouTube it checks if the current video has a chat replay hosted in [this GitHub repository](https://github.com/TheBiob/twitch-chat-storage), if it finds chat information for the current video in there it will display the messages as they were posted during the stream, similar to highlights on Twitch.

I plan on supporting Firefox as well at some point as I'll probably switch to that soon myself anyway but for now it's Chrome only.

### Can I use this myself?
Kind of? Currently you would have to distribute your own version of the extension and modify it to use a repository you control. I also don't have scripts to generate the necessary formats yet and it will probably change as I update this. Ideally I'd add a way for users to configure chat history sources if people are interested in this sort of thing.

Since it uses a git repository to fetch the chat data it has to grab the entire chat history for a video at once, which means it currently doesn't scale well for bigger streams with lots of messages either.

I'll add instructions on how to set this up once I have the scripts for it written and tested.

### Current features
 - Display chat messages when they appeared on stream
 - Seeking through the video updates the displayed messages
 - Messages contain a timestamp and can be clicked on to jump to the relevant point in the video
 - Standard Twitch badges will be displayed next to the user
 - User names link to their relevant twitch pages

### TODOs
 - Add scripts to automate downloading, formatting and pushing chat history files
 - Add Twitch as well as third party emotes to chat messages
 - Add a configuration page to the extension
 - Build some sort of cache for what video ids contain chat replays. Currently it simply tries to fetch any video that was clicked on from GitHub.
 - Fix the design. I'm not really a web dev so I have no idea what I'm doing.

