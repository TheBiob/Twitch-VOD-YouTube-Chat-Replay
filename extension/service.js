// background script to handle fetching repositories and caching information

if (typeof browser == "undefined") {
    globalThis.browser = chrome; // Chrome does not support the browser namespace yet.
}

const AppState = {
	VERSION: 0.1,
	MIN_SUPPORTED_VERSION: 0.1,

    CONFIG_REPOSITORIES: 'repositories',
    CONFIG_GENERAL: 'userSettings',

    loaded: false,

    repositories: [{
        url: 'https://raw.githubusercontent.com/TheBiob/twitch-chat-storage/refs/heads/main',
        status: 'unloaded',
        videos: null,
    }],

    config: null,
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'get-chat-data') {
        fetchVideoData(message.video_id).then(sendResponse);
        return true;
    } else if (message.type == 'get-status') {
        ensureLoaded().then(() => {
            sendResponse({
                repository_count: AppState.repositories.length,
                video_count: AppState.repositories.reduce((accum, value) => accum+(Object.keys(value.videos ?? {}).length), 0),
            });
        });
        return true;
    } else if (message.type == 'get-repositories') {
        ensureLoaded().then(() => {
            sendResponse(AppState.repositories);
        });
        return true;
    } else if (message.type == 'add-repository') {
        addRepository(message.url).then(sendResponse);
        return true;
    } else if (message.type == 'remove-repository') {
        removeRepository(message.url).then(sendResponse);
        return true;
    } else if (message.type == 'load-repositories') {
        reloadRepositories().then(sendResponse);
        return true;
    } else if (message.type == 'reload-repository') {
        reloadRepository(message.url).then(sendResponse);
        return true;
    } else if (message.type == 'get-config') {
        getConfig().then(sendResponse);
        return true;
    } else if (message.type == 'set-config') {
        updateConfig(message.config).then(sendResponse);
        return true;
    }
});

async function getConfig() {
    if (AppState.config === null) {
        AppState.config = {
            enable_last_mesasge_info: false,
            emotes: {
                global: {
                    twitch: true,
                    ffz: true,
                    bttv: true,
                    seventv: true
                },
                channel: {
                    ffz: true,
                    bttv: true,
                    seventv: true,
                }
            }
        };
        
        const config = await browser.storage.local.get(AppState.CONFIG_GENERAL);
        setConfigValues(config[AppState.CONFIG_GENERAL]);
    }

    return AppState.config;
}

async function updateConfig(config) {
    try {
        if (!AppState.config) {
            await getConfig();
        }

        setConfigValues(config);
        await browser.storage.local.set({[AppState.CONFIG_GENERAL]: AppState.config})

        return { success: true };
    } catch (e) {
        return { success: false, error: e };
    }
}

/**
 * Sets all properties of AppState.config to the passed in config object where the properties exist
 * @param {any} config The new config settings. Can be either the entire config object or only the properties that should change. Only properties that exist in and have the same type as AppState.config will be updated
 */
function setConfigValues(config) {
    if (typeof(config) !== 'object' || Object.keys(config).length === 0) {
        return;
    }

    let remaining = [{target: AppState.config, source: config }];
    let objects = null;

    while (objects = remaining.shift()) {
        for (let property in objects.target) {
            let type = typeof(objects.target[property]);

            if (type !== typeof(objects.source[property])) {
                continue;
            }

            if (type === 'object') {
                remaining.push({target: objects.target[property], source: objects.source[property] })
            } else  {
                objects.target[property] = objects.source[property];
            }
        }
    }
}

async function loadRepositoryVideos(repo) {
    try {
        const content = await fetch(repo.url+'/index.json');

        if (content.ok) {
            const json = await content.json();
            if (json != null && json.version && json.files && typeof(json.files) === 'object' && json.version >= AppState.MIN_SUPPORTED_VERSION) {
                if (json.version > AppState.VERSION) {
                    console.warn(`Version is newer than the extension version, it may not be fully supported: '${repo.url}'`);
                }
                
                repo.videos = json.files;
                repo.status = 'loaded';
                await browser.storage.session.set({ [repo.url]: json.files });
            } else {
                repo.status = 'invalid';
                console.warn(`Invalid json or unsupported version fetched from repository '${repo.url}'`);
            }
        } else {
            repo.status = 'error';
            console.warn(`Video ids for repository '${repo.url}' could not be fetched`);
        }
    } catch (e) {
        repo.status = 'error';
        console.error(e, repo);
    }
}

async function reloadRepository(url) {
    await ensureLoaded();

    const repo = AppState.repositories.find(repo => repo.url === url);
    if (repo) {
        await loadRepositoryVideos(repo);
        return { success: true };
    } else {
        return { success: false, error_message: 'Repository not found' };
    }
}

async function reloadRepositories() {
    await ensureLoaded();

    console.trace('Reloading repositories');
    for (let repo of AppState.repositories) {
        if (repo.status === 'unloaded') {
            await loadRepositoryVideos(repo);
        }
    }

    return true;
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
                        channel_id: json.twitch_info.streamer.id,
                        messages: json.messages,
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

    // No repository found that contains this video or the repository contained invalid data, return an empty chat replay object
    return {
        messages: null,
        embedded_data: null,
    };
}

async function getRepository(video_id) {
    await ensureLoaded();

    for (let repo of AppState.repositories) {
        if (repo.status === 'unloaded') {
            await loadRepositoryVideos(repo);
        }

        if (repo.videos && repo.videos[video_id]) {
            return repo.url;
        }
    }

    return null;
}

async function addRepository(url) {
    await ensureLoaded();

    const repo = {
        url,
        status: 'unloaded', 
        videos: null
    };

    for (let repo2 of AppState.repositories) {
        if (repo2.url == url) {
            return { success: false, error_message: 'Repository already added' };
        }
    }

    await loadRepositoryVideos(repo);

    if (repo.status == 'loaded') {
        AppState.repositories.push(repo);
        await saveRepositories();
        return { success: true };
    } else if (repo.status == 'error') {
        return { success: false, error_message: 'Repository could not be loaded' };
    } else if (repo.status == 'invalid') {
        return { success: false, error_message: 'Repository returned invalid data. It\'s version might be out of date' };
    }
    
    return { success: false, error_message: 'Unknown error' };
}
async function removeRepository(url) {
    const index = AppState.repositories.findIndex(repo => repo.url == url);
    if (index < 0) {
        return { success: false, error_message: 'Repository not found' };
    }

    AppState.repositories.splice(index, 1);
    await saveRepositories();

    return { success: true };
}

async function saveRepositories() {
    if (AppState.loaded) {
        await browser.storage.local.set({[AppState.CONFIG_REPOSITORIES]: AppState.repositories.map(repo => repo.url )});

        return true;
    }

    return false;
}

async function ensureLoaded() {
    if (!AppState.loaded) {
        const config = await browser.storage.local.get();
        const repositories = config[AppState.CONFIG_REPOSITORIES];
        if (Array.isArray(repositories)) {
            AppState.repositories = repositories.map(repo_url => {
                return {
                    url: repo_url,
                    status: 'unloaded',
                    videos: null
                }
            });
        }

        const session = await browser.storage.session.get();
        for (let repo of AppState.repositories) {
            if (repo.status === 'unloaded') {
                const videos = session[repo.url];
                if (videos !== undefined) {
                    repo.videos = videos;
                    repo.status = 'loaded';
                }
            }
        }

        AppState.loaded = true;
    }
}
