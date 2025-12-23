import {google, youtube_v3} from 'googleapis';

let yt_api_key = null;
const youtube = google.youtube('v3');
const three_weeks_ago = new Date();
three_weeks_ago.setDate(three_weeks_ago.getDate()-3*7);

const playlist_ids = [
    // 'PLqChpNq3_nCW74hnjIyEgiXO7mvhlaRUD', // HF - Streams 2024-2025
    // 'PLqChpNq3_nCWmpnpc2R1lSFRBpRVGEEyb', // HF - Streams 2022-2023
    'PLqChpNq3_nCVv1NvDgBkDz9fQL12RSJMX', // HF - Streams 2020-2021
    // 'PLqChpNq3_nCUEeoP-YSxTFGmlC3Q3L-9t', // HF - Streams 2017-2019
    // 'PLuHX8BJmgh6cqR6evtpbSJD8TxRvOsKrp', // Biob - Chain Reaction 2
];
const channels = [
    {
        // BiobVods
        id: 'UC22MRk6cxYuLxzstVKjVdnQ',
        published_after: three_weeks_ago
    }
];

const video_resolvers = {
    'thebiob': {
        get_video_candidates: () => Object.entries(video_cache).filter(x => x[1].snippet.channelTitle.toLowerCase() == 'biobvods').map(x => x[1]),
        get_dates_from_twitch_video: (video) => {
            return [video.date];
        },
        /** @param title {string} */
        get_date_from_yt_title: (title) => {
            const matches = title.matchAll(/^\s*\[(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{4})/g);
            for (let result of matches) {
                return new Date(parseInt(result.groups['year']), parseInt(result.groups['month'])-1, parseInt(result.groups['day']), 0, 0, 0, 0);
            }
            return null;
        },
        duration_threshold: 3,
    },
    'xhf01x': {
        get_video_candidates: () => Object.entries(video_cache).filter(x => x[1].snippet.channelTitle.toLowerCase() == 'xhf01x').map(x => x[1]),
        get_dates_from_twitch_video: (video) => {
            let dates = [video.date];
            const matches = video.title.matchAll(/^Stream vom (?<day>\d{2})\.(?<month>\d{2})(\.(?<year>\d{2}))?/g);
            for (let result of matches) {
                let year = video.date.getFullYear().toString();
                if (result.groups['year']) {
                    year = '20'+result.groups['year'];
                }
                let date = new Date(parseInt(year), parseInt(result.groups['month'])-1, parseInt(result.groups['day']), 0, 0, 0, 0);
                if (date.getFullYear() != video.date.getFullYear()
                    || date.getMonth() != video.date.getMonth()
                    || date.getDate() != video.date.getDate())
                {
                    dates.push(date);
                }
            }
            return dates;
        },
        /** @param title {string} */
        get_date_from_yt_title: (title) => {
            const matches = title.matchAll(/^\s*\[(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{2})/g);
            for (let result of matches) {
                return new Date(parseInt('20'+result.groups['year']), parseInt(result.groups['month'])-1, parseInt(result.groups['day']), 0, 0, 0, 0);
            }
            return null;
        },
        duration_threshold: 3,
    }
}

const YT_PAGE_SIZE = 50; // 50 is the maximum allowed value for most if not all APIs

/** @type {youtube_v3.Schema$Video[]} */
const video_cache = {};
let has_cached_videos = false;

/** @param {string} playlist_id  */
async function populate_from_playlist(playlist_id, verbose) {
    let current_total = 0;
    let next_page_token = null;
    let full_total = undefined;
    let all_video_ids = [];
    if (!verbose) {
        console.log(`Fetching videos from playlist ${playlist_id}`);
    }
    do
    {
        if (verbose) {
            console.log(`Fetching videos from playlist ${playlist_id} (${current_total}/${full_total===undefined?'unknown':full_total}, ${next_page_token})`);
        }
        let response = await youtube.playlistItems.list({
            key: yt_api_key,
            playlistId: playlist_id,
            maxResults: YT_PAGE_SIZE,
            pageToken: next_page_token,
            part: 'snippet',
        });

        let items = response.data.items.map(x => x.snippet.resourceId.videoId);

        all_video_ids.push(...items);

        current_total += items.length;
        full_total = response.data.pageInfo.totalResults;

        next_page_token = response.data.nextPageToken
    } while (next_page_token);

    if (verbose) {
        console.log(`Fetching videos from playlist ${playlist_id} finished (${current_total}/${full_total===undefined?'unknown':full_total})`);
    }

    return all_video_ids;
}

async function populate_from_channel(channel, verbose) {
    let current_total = 0;
    let next_page_token = null;
    let full_total = undefined;
    let all_video_ids = [];
    // YouTube API expects a RFC 3339 date string, not an ISO 8601 one, but they're compatible enough
    const publishedAfter = channel.published_after.toISOString();
    const channel_id = channel.id;
    if (!verbose) {
        console.log(`Fetching videos for channel ${channel_id}`);
    }
    do
    {
        if (verbose) {
            console.log(`Fetching videos for channel ${channel_id} (${current_total}/${full_total===undefined?'unknown':full_total}, ${next_page_token})`);
        }
        let response = await youtube.search.list({
            key: yt_api_key,
            part: 'snippet',
            maxResults: YT_PAGE_SIZE,
            channelId: channel_id,
            order: 'date',
            safeSearch: 'none',
            type: 'video',
            publishedAfter,
            pageToken: next_page_token,
        });

        let items = response.data.items.map(x => x.id.videoId);

        all_video_ids.push(...items);

        current_total += items.length;
        full_total = response.data.pageInfo.totalResults;

        next_page_token = response.data.nextPageToken
    } while (next_page_token);

    if (verbose) {
        console.log(`Fetching videos for channel ${channel_id} finished (${current_total}/${full_total===undefined?'unknown':full_total})`);
    }

    return all_video_ids;
}

/** @returns {Promise<youtube_v3.Schema$Video[]>} */
async function fetch_videos(video_ids, verbose) {
    const map = {};
    let filtered_video_ids = [];
    for (let id of video_ids) {
        if (!map[id]) {
            map[id] = true;
            filtered_video_ids.push(id);
        }
    }
    
    let current_total = 0;
    let all_videos = [];
    if (!verbose) {
        console.log(`Fetching ${filtered_video_ids.length} videos`);
    }
    while (current_total < filtered_video_ids.length)
    {
        let slice = filtered_video_ids.slice(current_total, current_total+YT_PAGE_SIZE);
        if (slice.length == 0) {
            console.warn('Empty slice encountered while fetching videos')
            break;
        }
        if (verbose)
        {
            console.log(`Fetching ${filtered_video_ids.length} videos (${current_total}/${filtered_video_ids.length})`);
        }
        let response = await youtube.videos.list({
            key: yt_api_key,
            part: 'snippet,contentDetails',
            id: slice.join(','),
        });

        all_videos.push(...response.data.items);

        current_total += slice.length;
    }

    if (verbose) {
        console.log(`Fetching ${filtered_video_ids.length} videos (${current_total}/${filtered_video_ids.length})`);
    }

    return all_videos;
}

function has_api_key() {
    return typeof(yt_api_key) === 'string' && yt_api_key.length > 0;
}

async function populate_video_cache(verbose = false) {
    if (!has_api_key())
        return;

    if (has_cached_videos)
        return;

    let video_ids = [];

    for (let playlist of playlist_ids) {
        let playlist_videos = await populate_from_playlist(playlist, verbose);
        video_ids.push(...playlist_videos);
    }

    for (let channel of channels) {
        let channel_videos = await populate_from_channel(channel, verbose);
        video_ids.push(...channel_videos);
    }

    let videos = await fetch_videos(video_ids, verbose);
    for (let video of videos) {
        video_cache[video.id] = video;
    }

    has_cached_videos = true;
}

function parse_duration(input) {
    let durationInSeconds = 0;
    const matches = input.matchAll(/PT((?<h>\d+)H)?((?<m>\d+)M)?((?<s>\d+)S)?/g);
    for (let result of matches) {
        durationInSeconds = parseInt(result.groups['h'] || 0)*60*60;
        durationInSeconds += parseInt(result.groups['m'] || 0)*60;
        durationInSeconds += parseInt(result.groups['s'] || 0);
        break;
    }

    return durationInSeconds;
}

function SetYouTubeAPIKey(api_key) {
    yt_api_key = api_key;
}

/** 
 * @param {{ twitch_id: string, title: string, duration: number, date: Date, channel: string, youtube_id: string | null }} vid
 * @returns {Promise<null | string>}>}
 */
async function TryGetYoutubeId(vid, verbose = true) {
    if (!has_api_key())
        return;

    await populate_video_cache(verbose);

    const user_name = vid.channel.toLowerCase()
    let resolver = video_resolvers[user_name];
    if (resolver) {
        if (!resolver.__video_cache) {
            resolver.__video_cache = resolver.get_video_candidates();
        }

        if (!resolver.__title_date_cache) {
            resolver.__title_date_cache = {};
        }
    
        if (!resolver.__dates) {
            resolver.__dates = {};
        }

        if (!resolver.__dates[vid.twitch_id]) {
            resolver.__dates[vid.twitch_id] = resolver.get_dates_from_twitch_video(vid);
        }

        /** @type {youtube_v3.Schema$Video[]} */
        let potential_videos = [];
        for (let tvideo of resolver.__video_cache) {
            /** @type {youtube_v3.Schema$Video} */
            const video = tvideo;
            
            const title = video.snippet.title;
            if (resolver.__title_date_cache[title] === undefined) {
                resolver.__title_date_cache[title] = resolver.get_date_from_yt_title(title);
            }
            
            /** @type {Date} */
            const date_from_yt_title = resolver.__title_date_cache[title];

            if (date_from_yt_title === null) {
                // Couldn't parse date, just skip this entry (could go for duration anyway?)
                continue;
            }

            for (let twitch_date of resolver.__dates[vid.twitch_id]) {
                if (twitch_date.getFullYear() == date_from_yt_title.getFullYear()
                    && twitch_date.getMonth() == date_from_yt_title.getMonth()
                    && twitch_date.getDate() == date_from_yt_title.getDate()
                ) {
                    // twitch vod date matches date of title of video, check the duration as well
                    if (video.contentDetails.__durationInSeconds === undefined) {
                        video.contentDetails.__durationInSeconds = parse_duration(video.contentDetails.duration);
                    }
                    if (Math.abs(video.contentDetails.__durationInSeconds-vid.duration) < resolver.duration_threshold) {
                        potential_videos.push(video);
                    }
                }
            }
        }

        if (potential_videos.length === 1) {
            const video = potential_videos[0];
            console.log(`Found YouTube match: [${video.snippet.publishedAt}] ${video.snippet.title} - ${video.contentDetails.duration} (${video.snippet.channelTitle}) - https://youtu.be/${video.id}`);
            return potential_videos[0].id;
        } else if (potential_videos.length > 1) {
            console.log('Multiple candidates found: ');
            for (let video of potential_videos) {
                console.log(`[${video.snippet.publishedAt}] ${video.snippet.title} - ${video.contentDetails.duration} (${video.snippet.channelTitle}) - https://youtu.be/${video.id}`);
            }
        }
    }
    
    return null;
}

export { TryGetYoutubeId, populate_video_cache as PopulateVideoCache, SetYouTubeAPIKey };
