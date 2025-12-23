import { HelixVideo } from '@twurple/api';
import { AppTokenAuthProvider } from '@twurple/auth';
import { callTwitchApi } from '@twurple/api-call';
import { readdirSync, readFile, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'node:readline/promises';
import { exec } from 'node:child_process';
import { TryGetYoutubeId, PopulateVideoCache, SetYouTubeAPIKey } from './youtube.js';
import { readFileSync, renameSync } from 'node:fs';

const user_ids = [
    '66722858', // xhf01x
    '82332987', // thebiob
];

// const excluded_twitch_ids = [
//     '2541990965', // Escape the gothic castle clear
//     '259525918', // Save Strats
//     '154515399', // Fishy
// ]

const verbose = true;
const auto_mode = true; // If true, script won't ask for user input if no youtube video was found.

const dirname = import.meta.dirname;
const path = dirname+'/chat_repository/raw/';
const cache_file = dirname+'/video_cache.json';
const raw_directory = dirname+'/chat_repository/raw/';
const twitch_dl_cli = dirname+'/TwitchDownloaderCLI.exe';
const process_video_script = 'process_chat_repository.js';
const auth_file = dirname+'/auth_config.json';

function is_auth_config_valid(config) {
    return typeof(config) === 'object'
        && typeof(config.twitch_client_id) === 'string' && config.twitch_client_id.length > 0
        && typeof(config.twitch_client_secret) === 'string' && config.twitch_client_secret.length > 0
        // TODO: youtube should probably be optional, it'd still work, just wouldn't be able to map to youtube videos automatically
        && typeof(config.youtube_api_key) === 'string' && config.youtube_api_key.length > 0;
}

async function main() {
    let auth_config = {
        twitch_client_id: null,
        twitch_client_secret: null,
        youtube_api_key: null,
    }
    if (existsSync(auth_file)) {
        try {
            let file_contents = readFileSync(auth_file, 'utf-8');
            auth_config = JSON.parse(file_contents);
        } catch (e) {
            console.err(e);
        }
    }

    if (!is_auth_config_valid(auth_config)) {
        if (auto_mode) {
            throw `API authentication config could not be read, some API keys are missing`;
        }

        if (typeof(auth_config) !== 'object') {
            auth_config = {};
        }

        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        if (typeof(auth_config.twitch_client_id) !== 'string') {
            auth_config.twitch_client_id = (await rl.question('Twitch Client ID: '));
        }
        if (typeof(auth_config.twitch_client_secret) !== 'string') {
            auth_config.twitch_client_secret = (await rl.question('Twitch Client Secret: '));
        }
        if (typeof(auth_config.youtube_api_key) !== 'string') {
            auth_config.youtube_api_key = (await rl.question('YouTube API Key: '));
        }

        rl.close();
    }

    if (!is_auth_config_valid(auth_config)) {
        throw `Authentication config is incomplete. Aborting`;
    }

    if (!existsSync(auth_file)) {
        let file_contents = JSON.stringify(auth_config);
        writeFileSync(auth_file, file_contents, 'utf-8');
    }


    let ids_task = null;
    if (existsSync(cache_file)) {
        console.log('Finding existing video ids (cached)...');
        ids_task = new Promise((resolve, reject) => {
            readFile(cache_file, (err, data) => {
                if (err === null) {
                    resolve(JSON.parse(data.toString('utf-8')));
                } else {
                    reject(err);
                }
            });
        }).then(cache => {
            // Update date field to be an actual Date object
            for (let value of cache) {
                value.date = new Date(value.date);
            }
            return cache;
        });
    } else {
        console.log('Finding existing video ids...');
        const files = readdirSync(path);
        ids_task = Promise.allSettled(files.map(async (file_name) => {
            if (file_name.endsWith('.json')/* && !file_path.startsWith('@') */) {
                return await new Promise((resolve, reject) => {
                    readFile(path + file_name, (err, file) => {
                        if (err) {
                            reject(err);
                        }
                        
                        let str = file.toString('utf8')
                        let json = JSON.parse(str);
                        resolve({ name: file_name.substring(0, file_name.lastIndexOf('.')), file_name, json });
                    });
                });
            } else if (file_name != '.gitignore') {
                console.warn(`File without json extension in raw directory: ${file_name}`);
            }
            return null;
        })).then(settled => {
            let errored = settled.filter(x => x.status !== 'fulfilled');
            if (errored.length > 0) {
                console.error('Failed to read some files', errored);
                throw `Failed to read ${errored.length} files`;
            }
            return settled
                    .filter(x => x.status === 'fulfilled' && x.value != null)
                    .map(x => {
                        return {
                            twitch_id: x.value.json.video.id,
                            // minimum needed metadata to try and map to a youtube video
                            title: x.value.json.video.title,
                            duration: x.value.json.video.length,
                            date: new Date(x.value.json.video.created_at),
                            channel: x.value.json.streamer.name,
                            file: x.value.file_name,
                            // if the file does not start with @ it's already mapped to a youtube video
                            //  this being null is used to determine if this video still needs to be mapped to a youtube video
                            youtube_id: x.value.name.startsWith('@') || x.value.name.includes(' ') ? null : x.value.name,
                        }
                    });
        });
    }

    const authProvider = new AppTokenAuthProvider(auth_config.twitch_client_id, auth_config.twitch_client_secret);

    /** @returns HelixVideo[] */
    async function getTwitchVODs(user_id, token) {
        console.log(`Fetching VODs for ${user_id}`);
        const max_items_per_page = 20;
        const max_requests = 50;

        /** @type HelixVideo[] */
        const helix_videos = [];

        let request = 0;
        let page_cursor = undefined;
        while (request++ < max_requests) {
            const response = await callTwitchApi({ url: 'videos', query: { user_id, type: 'archive', first: max_items_per_page, after: page_cursor } }, authProvider.clientId, token.accessToken);
            helix_videos.push(...response.data.map(data => new HelixVideo(data)));

            // Check if we have more pages to fetch, break if we don't.
            // TODO: is the respnose.data.length reliable? pagination.cursor appears to have a cursor on the final result pointing to a
            //       page with 0 entries which seems... pointless? It just saves one unnecessary request if response.data.length is guaranteed
            //       to only ever be less than the requested amount of items per page on the last page.
            if (response.data.length < max_items_per_page || typeof response.pagination?.cursor !== 'string') {
                break;
            } else {
                page_cursor = response.pagination.cursor;
            }
        }
        return helix_videos;
    }

    /**
     * Function to execute exe
     * @param {string} fileName The name of the executable file to run.
     * @param {string[]} params List of string arguments.
     */
	function execute(fileName, params) {
		return new Promise((resolve, reject) => {
			const std = {
				out: "",
				err: "",
			}
			const process = exec([fileName, ...params].map(el => `"${el}"`).join(" "), {
				cwd: dirname,
			});
			for (const stream in std) {
                process[`std${stream}`].on("data", function(data) {
                    if(stream == "out")
						console.log(data.trim());
                    else if (verbose)
						console.error(data.trim());
                    std[stream] += data;
				});
            }
			process.on("exit", function(code) {
				if (code) {
                    reject(new Error(std.err));
                } else {
                    resolve(""/*std.out*/);
                }
			});
		});
	}
    const vod_list_task = authProvider.getAppAccessToken().then(token => {
        return Promise.all(user_ids.map(uid => getTwitchVODs(uid, token)));
    });

    const vod_list = (await vod_list_task).flat();
    const ids = await ids_task;

    const rl = auto_mode ? null : createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    const new_videos = vod_list.filter(vid => !ids.some(known_vid => known_vid.twitch_id == vid.id)/* && !excluded_twitch_ids.includes(vid.id)*/).map(vid => {
        return {
            success: false,
            data: {
                twitch_id: vid.id,
                // minimum needed metadata to try and map to a youtube video
                title: vid.title,
                duration: vid.durationInSeconds,
                date: vid.creationDate,
                channel: vid.userName,
                file: null,
                // if the file does not start with @ it's already mapped to a youtube video
                //  this being null is used to determine if this video still needs to be mapped to a youtube video
                /** @type {null|string} */
                youtube_id: null,
            }
        };
    });
    const unmapped_videos = ids.filter(vid => vid.youtube_id === null).map(vid => {
        return {
            success: false,
            data: vid
        };
    });

    console.log(`Processing ${new_videos.length} new and ${unmapped_videos.length} unmapped videos`);
    if (new_videos.length+unmapped_videos.length > 0) {
        SetYouTubeAPIKey(auth_config.youtube_api_key);
        // TryGetYoutubeId will already do that but the logs get in the way the first time
        await PopulateVideoCache(verbose);
    }

    let has_changes = false;
    for (let vid of new_videos.concat(unmapped_videos)) {
        console.log(``);
        if (vid.data.file) {
            console.log(`[${formatDate(vid.data.date, '%d.%M.%y')}] ${vid.data.title} (${formatDuration(vid.data.duration)}, ${vid.data.twitch_id}, ${vid.data.channel}) (${vid.data.file})`);
        } else {
            console.log(`[${formatDate(vid.data.date, '%d.%M.%y')}] ${vid.data.title} (${formatDuration(vid.data.duration)}, ${vid.data.twitch_id}, ${vid.data.channel})`);
        }
        let youtube_match = await TryGetYoutubeId(vid.data);

        let yt_id = '';
        if (youtube_match) {
            yt_id = youtube_match;
        } else {
            yt_id = auto_mode ? yt_id : (await rl.question('No matching YouTube Id found, enter Id manually: ')).trim()

            if (yt_id.length == 0) {
                yt_id = `@${vid.data.channel}-${formatDate(vid.data.date, '%y-%M-%d')}`;
            } else if (yt_id == '-') {
                console.log('Skipping VOD '+vid.data.twitch_id);
                continue;
            }
        }

        //*
        if (existsSync(raw_directory+yt_id+'.json')) {
            if (vid.data.file == null) {
                let new_file_name = `@@${yt_id}-${new Date().toISOString().replaceAll(/[\\/:*?"<>|]/g, '_')}`;
                console.warn(`File for YouTube Id ${yt_id} already exists, video will be downloaded as ${new_file_name}`);
                yt_id = new_file_name
            } else {
                if (yt_id.toLowerCase()+'.json' != vid.data.file.toLowerCase()) {
                    console.warn(`File for YouTube Id ${yt_id} already exists, file ${vid.data.file} will not be renamed`);
                } else if (verbose) {
                    console.warn(`No new ID for file ${yt_id}.json found, skipping`);
                }
                continue;
            }
        }
        
        if (vid.data.file == null) {
            try {
                await execute(twitch_dl_cli, [
                    'chatdownload',
                    '--id', vid.data.twitch_id,
                    '--embed-images', 'true',
                    '--output', raw_directory+yt_id+'.json',
                    '--collision', 'Rename'
                ]);
                if (yt_id.length != 0 && yt_id[0] != '@') {
                    await execute('node', [process_video_script, '--files='+yt_id]);
                    vid.data.youtube_id = yt_id;
                }
                vid.data.file = yt_id+'.json';
                vid.success = true;
                has_changes = true;
            } catch (e) {
                console.error(e);
            }
        } else if (yt_id[0] !== '@') {
            renameSync(raw_directory+vid.data.file, raw_directory+yt_id+'.json');
            await execute('node', [process_video_script, '--files='+yt_id]);
            vid.data.youtube_id = yt_id;
            vid.data.file = yt_id+'.json';
            has_changes = true;
        } else {
            console.warn(`File is already unmapped as ${vid.data.file} and will not be renamed to ${yt_id}`);
        }
        // */
    }

    if (rl) {
        rl.close();
    }

    if (has_changes || !existsSync(cache_file)) {
        let all_ids = ids.concat(new_videos.filter(x => x.success).map(x => x.data));
        writeFileSync(cache_file, JSON.stringify(all_ids));
    }

    return has_changes
}

function formatDate(date, format) {
    return format.replaceAll(/%\w/g, (match) => {
        switch (match) {
            case '%d':
                return date.getDate().toString().padStart(2, '0');
            case '%M':
                return (date.getMonth()+1).toString().padStart(2, '0');
            case '%y':
                return date.getFullYear();
            default:
                if (verbose) {
                    console.warn('Unrecognized date format specifier '+match);
                }
                return match;
        }
    });
}

function formatDuration(duration_in_seconds) {
    let h = Math.floor(duration_in_seconds/60/60);
    let m = Math.floor(duration_in_seconds/60 % 60);
    let s = Math.floor(duration_in_seconds % 60);

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

main()
.then(has_changes => process.exit(has_changes ? 0 : 1))
.catch(e => {
    console.error(e);
    process.exit(1);
});
