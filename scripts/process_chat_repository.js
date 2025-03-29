import { readdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const CHAT_REPOSITORY = '../../chat_repository/';
const RAW_PATH = CHAT_REPOSITORY+'raw/';
const PROCESSED_PATH = CHAT_REPOSITORY+'processed/';
const INDEX_JSON = CHAT_REPOSITORY+'index.json';
const FORMAT_VERSION = 0.1;

async function main() {
    let settings = readCommandLine();

    let files;
    if (settings.files == '*') {
        files = (await readdir(RAW_PATH)).filter(x => x.endsWith('.json'));
    } else {
        files = settings.files.split(',').map(x => x+'.json');
    }

    let data = await Promise.allSettled(files.map(processJsonChatFile));
    for (let task of data) {
        if (task.status == 'fulfilled') {
            await writeFile(PROCESSED_PATH+task.value.file, JSON.stringify(task.value.data, null, 0), { encoding: 'utf8' });
        } else {
            console.warn('Failed: ', task.path, task.error);
        }
    }

    await updateIndex();
}

function messageSort(a, b) {
    if (a.content_offset_seconds == b.content_offset_seconds) { // Sort message by content_offset_seconds, if equal, sort by fractional part of created_at (todo: take the actual second into account as well, or ideally parse the date with full precision, standard Date only parses up to miliseconds)
        return parseInt(a.created_at.substring(a.created_at.indexOf('.')+1,a.created_at.length-1))
            - parseInt(b.created_at.substring(b.created_at.indexOf('.')+1,b.created_at.length-1))
    } else {
        return a.content_offset_seconds - b.content_offset_seconds;
    }
}

async function processJsonChatFile(file) {
    const path = RAW_PATH+file;
    
    try {
        const data = await readFile(path, 'utf8');
        const obj = JSON.parse(data);
        
        let messages = [];
        let sorted = obj.comments.sort(messageSort);
        let next_message_disperse_offset = 0;
        for (let i = 0; i < sorted.length; i++) {
            let message = sorted[i];
            if (i != sorted.length-1 && i >= next_message_disperse_offset) {
                let same_second_message_counter = 1;
                while (i + same_second_message_counter < sorted.length && sorted[i].content_offset_seconds == sorted[i+same_second_message_counter].content_offset_seconds) {
                    same_second_message_counter++; // Search until we have found all messages with the same value for content_offset_seconds
                }

                for (let j = 1; j < same_second_message_counter; j++) {
                    // update all following messages with the same content_offset_seconds value so that they are evenly distributed within the second
                    sorted[i+j].content_offset_seconds += j/same_second_message_counter;
                }
                next_message_disperse_offset = i+same_second_message_counter;
            }

            const twitch_emotes = {};
            for (let fragment of message.message.fragments) {
                if (fragment.emoticon ) {
                    if (twitch_emotes[fragment.text] && twitch_emotes[fragment.text] !== fragment.emoticon.emoticon_id) {
                        console.warn(`Duplicate emote ${fragment.text} with different id ${twitch_emotes[fragment.text]} -> ${fragment.emoticon.emoticon_id} in ${file}`);
                    }
                    twitch_emotes[fragment.text] = fragment.emoticon.emoticon_id;
                }
            }
            const new_message = {
                //"_id": message._id,
                "content_offset_seconds": message.content_offset_seconds,
                "commenter": {
                    "_id": message.commenter._id,
                    "display_name": message.commenter.display_name,
                    "name": message.commenter.name,
                },
                "message": {
                    "body": message.message.body,
                    "user_color": message.message.user_color,
                    "user_badges": message.message.user_badges,
                    "twitch_emotes": twitch_emotes,
                }
            };

            // Delete empty elements when they aren't needed to reduce json file size
            if (Object.keys(new_message.message.twitch_emotes).length == 0) {
                delete new_message.message.twitch_emotes;
            }
            if (new_message.message.user_badges.length == 0) {
                delete new_message.message.user_badges;
            }

            messages.push(new_message);
        }
        
        let twitch_badges = {};
        for (let badge of obj.embeddedData.twitchBadges) {
            twitch_badges[badge.name] = badge;
        }
        
        return {
            file,
            data: {
                version: FORMAT_VERSION,
                twitch_info: {
                    video_id: obj.video.id,
                    title: obj.video.title,
                    description: obj.video.description,
                    chapters: obj.video.chapters,
                    streamer: obj.streamer,
                },
                embedded_data: {
                    twitch_badges,
                },
                messages
            }
        };
    } catch (error) {
        throw { path, error };
    }
}

async function updateIndex() {
    let files = await Promise.allSettled((await readdir(PROCESSED_PATH)).filter(x => x.endsWith('.json')).map(async (file) => {
        const path = PROCESSED_PATH+file;
        try {
            const data = await readFile(path);
            const obj = JSON.parse(data);
            if (typeof(obj) == typeof({}) && obj.version >= FORMAT_VERSION && obj.messages) {
                return { file, data: obj };
            }
            
            throw { file, error: 'Data not in expected format' };
        } catch (error) {
            throw { file, error };
        }
    }));

    let index_data = {
        version: FORMAT_VERSION,
        files: {}
    };
    for (let task of files) {
        if (task.status == 'fulfilled') {
            index_data.files[task.value.file.substring(0, task.value.file.length-'.json'.length)] = {
                title: task.value.data.twitch_info.title,
            }
        } else {
            console.warn('Failed: ', task.path, task.error);
        }
    }

    await writeFile(INDEX_JSON, JSON.stringify(index_data, null, 4), 'utf8');
}

function readCommandLine() {
    const options = {
        help: {
            description: 'Displays this help',
            type: 'boolean',
            short: 'h',
        },
        files: {
            description: 'A comma separated list of YT ids to process',
            type: 'string',
            default: '*',
            short: 'f',
        }
    };

    let data;
    try
    {
        const {values} = parseArgs({
            args: process.argv.slice(2),
            options,
        });

        data = values;
    } catch (e) {
        console.warn(e);
    }

    if (!data || data.help || (!data.all && (!data.files || data.files.length == 0))) {
        console.info(`Usage: process_raw.js <args>
Options:
${getHelp(options)}`);
        process.exit(data.help ? 0 : 1);
    }
    
    return data;
}

function getHelp(options) {
    let help = '';
    for (let key in options) {
        let settings = options[key];
        help += `--${key}`;
        if (settings.short) {
            help += ` -${settings.short}`;
        }

        if (settings.description) {
            help += '\r\n\t' + settings.description;
        }

        if (settings.default !== undefined) {
            help += '\r\n\tDefault: ' + settings.default;
        }
        help += '\r\n\r\n';
    }
    return help;
}

main()
.then(() => console.log('Done'))
.catch(e => console.error(e));
