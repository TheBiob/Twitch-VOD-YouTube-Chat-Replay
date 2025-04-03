class EmoteRenderer {
    constructor(fetcher, config) {
        this.config = config;
        this.fetcher = fetcher;
        this.channel_id = null;

        // Skip parsing if none of the emotes are enabled anyway
        this.no_emotes = !config.emotes.global.twitch
            && !config.emotes.global.ffz
            && !config.emotes.global.bttv
            && !config.emotes.global.seventv
            && !config.emotes.channel.ffz
            && !config.emotes.channel.bttv
            && !config.emotes.channel.seventv;
    }

    /**
     * Sets the active channel id and fetches necessary third party emotes if they aren't available yet
     * @param {string} channel_id The channel id whose emotes are currently active
     */
    async setChannelIdAsync(channel_id) {
        this.channel_id = channel_id;
        if (!this.no_emotes && this.fetcher.channels.get(channel_id) == null) {
            await Promise.allSettled([
                // FFZ channel
                this.config.emotes.channel.ffz ? this.fetcher.fetchFFZEmotes(channel_id) : Promise.resolve(),
                // BTTV channel
                this.config.emotes.channel.bttv ? this.fetcher.fetchBTTVEmotes(channel_id) : Promise.resolve(),
                // 7TV channel
                this.config.emotes.channel.seventv ? this.fetcher.fetchSevenTVEmotes(channel_id) : Promise.resolve(),
            ]);
        }
    }

    _createTextFragment(str) {
        const elem = document.createElement('span');
        elem.innerText = str;
        elem.classList.add('text-fragment');
        return elem;
    }

    _createEmote(emote, size=0) {
        const elem = document.createElement('div');
        elem.classList.add('twitch-emote');
        const img = document.createElement('img');
        img.classList.add('twitch-emote', 'twitch-emote-'+size);
        img.dataset.owner = emote.ownerName || 'global';
        img.alt = emote.code;
        img.title = emote.code;
        img.src = emote.toLink(size);
        elem.appendChild(img);
        return elem;
    }

    /**
     * Parses a message and replaces all currently active emotes found within
     * @param {*} message The message object to parse. Must contain .body with the message content and optionally .twitch_emotes with a map of twitch emotes that should be replaced
     * @param {*} size The emote size
     * @returns A list of HTMLElements that make up the message, split into text fragments and emotes
     */
    parseMessage(message, size=0) {
        if (this.no_emotes) {
            return [this._createTextFragment(message.body)];
        }

        const inlineEmotes = this.config.emotes.global.twitch ? message.twitch_emotes || {} : {};
        const channelEmotes = this.fetcher.channels.get(this.channel_id)?.emotes;
        const globalEmotes = this.fetcher.channels.get(null)?.emotes;

        const regex = /(\S+)/g;
        const emote_matches = [];
        let match;
        while (match = regex.exec(message.body)) {
            const id = match[1];
            let emote = inlineEmotes[id];
            if (!emote) emote = channelEmotes?.get(id);
            else {
                const twitch_emote_id = emote;
                emote = {
                    code: id,
                    modifier: false,
                    toLink: (size) => `https://static-cdn.jtvnw.net/emoticons/v2/${twitch_emote_id}/default/dark/${size+1}.0`,
                }
            }
            if (!emote) emote = globalEmotes?.get(id);
            if (!emote) continue;

            emote_matches.push({
                index: match.index,
                length: match[0].length,
                emote
            });
        }

        const child_elements = [];
        
        // Split it into text fragments + emotes
        let previous_index = 0;
        for (let match of emote_matches) {
            if (previous_index != match.index) {
                child_elements.push(this._createTextFragment(message.body.substring(previous_index, match.index)));
            }
            previous_index = match.index+match.length;
            child_elements.push(this._createEmote(match.emote, size));
        }

        // If there is message left over after the last emote, return it as a text fragment
        if (previous_index < message.body.length) {
            child_elements.push(this._createTextFragment(message.body.substring(previous_index, message.body.length)));
        }

        return child_elements;
    }
}

module.exports = { EmoteRenderer };
