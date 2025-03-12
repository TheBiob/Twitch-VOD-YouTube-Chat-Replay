// service worker to handle fetching repositories and caching information

const AppState = {
	VERSION: 0.1,
	MIN_SUPPORTED_VERSION: 0.1,

    repositories: ['https://raw.githubusercontent.com/TheBiob/twitch-chat-storage/refs/heads/main'],
    known_video_ids: null,
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'get-chat-data') {
        fetchVideoData(message.video_id).then(sendResponse);
        return true;
    }
});

async function reloadRepositories() {
    console.trace('Reloading repositories');
    AppState.known_video_ids = {};
    for (let i = 0; i < AppState.repositories.length; i++) {
        const repo = AppState.repositories[i];
        try {
            const content = await fetch(repo+'/index.json');

            if (content.ok) {
                const json = await content.json();
                if (json != null && json.version && json.files && json.version >= AppState.MIN_SUPPORTED_VERSION) {
                    if (json.version > AppState.VERSION) {
                        console.warn(`Version is newer than the extension version, it may not be fully supported: '${repo}'`);
                    }
                    
                    for (let video in json.files) {
                        if (AppState.known_video_ids[video] !== undefined) {
                            console.warn(`Video ${video_id} already contained in repository '${AppState.repositories[AppState.known_video_ids[video]]}' (Also contained in repo: '${repo}')`)
                        } else {
                            AppState.known_video_ids[video] = i;
                        }
                    }
                } else {
                    console.warn(`Invalid json or unsupported version fetched from repository '${repo}'`);
                }
            } else {
                console.warn(`Video ids for repository '${repo}' could not be fetched`);
            }
        } catch (e) {
            console.error(e, repo);
        }
    }
}

async function fetchVideoData(video_id) {
    try {
        console.trace('fetching video data for ' + video_id);
        const repository = await getRepository(video_id);
        if (repository !== null) {
            const content = await fetch(repository+'/processed/' + video_id + '.json');
            if (content.ok) {
                const json = await content.json();
                if (json != null) {

                    // If the chat data was successfully fetched, return the data
                    return {
                        loaded: true,
                        exists: true,
                        for_video_id: video_id,
                        messages: json.messages,
                        previous_message_time: -1,
                        next_message: null,
                        next_message_index: 0,
                        embedded_data: json.embedded_data,
                    };
                }
            } else {
                console.warn(`Data for ${video_id} could not be fetched`);
            }
        }
    } catch (e) {
        console.error(e);
    }

    console.trace('No data found');
    // No repository found that contains this video or the repository contained invalid data, return an empty chat replay object
    return {
        loaded: false,
        exists: false,
        for_video_id: video_id,
        messages: [],
        previous_message_time: -1,
        next_message: null,
        next_message_index: 0,
        embedded_data: null,
    };
}

async function getRepository(video_id) {
    if (AppState.known_video_ids === null) {
        await reloadRepositories();
    }

    const video = AppState.known_video_ids[video_id];
    if (video !== undefined) {
        return AppState.repositories[video];
    }

    return null;
}
