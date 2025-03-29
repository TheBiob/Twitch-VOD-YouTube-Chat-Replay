const { EmoteFetcher } = require('@mkody/twitch-emoticons');
const { EmoteRenderer } = require('./EmoteRenderer.js');

if (typeof browser == "undefined") {
    globalThis.browser = chrome; // Chrome does not support the browser namespace yet.
}

const AppState = {
	is_initialized: false,
	initialized_failed: false,
	video_element: undefined,
	chat_container: undefined,
	chat_list: undefined,
	chat_template: undefined,
	active_chat_history: {
		loaded: false,
		for_video_id: undefined,
		messages: [],
		current_message_index: -1,
		embedded_data: null,
	},

	emote_fetcher: null,
	emote_renderer: null,
}

if (window.navigation != undefined) {
	window.navigation.addEventListener('navigate', OnNavigate);
} else {
	// Navigate event is not supported, poll for changes using MutationObserver
	let old_href = document.location.href;
	const body = document.querySelector('body');
	const observer = new MutationObserver(mutations => {
		if (old_href != document.location.href) {
			old_href = document.location.href;
			OnNavigate({ destination: { url: old_href } });
		}
	});
	observer.observe(body, { childList: true, subtree: true });
}

async function OnNavigate(ev) {
	if (ev.destination.url.indexOf('/watch') >= 0 && ev.destination.url.indexOf('?') >= 0) {
		await ApplyChatForVideo(ev.destination.url.substring(ev.destination.url.indexOf('?')))
	}
}

async function TryInitialize() {
	await SetupAppState();
	if (AppState.is_initialized) {
		console.log('Initialized');
		await ApplyChatForVideo(window.location.search);
	} else {
		if (!AppState.initialized_failed) {
			console.trace('retrying initialization in 1 second');
			window.setTimeout(TryInitialize, 1000);
		}
	}
}

function onVideoTimeUpdate() {
	RenderChatHistory(false);
}
function onVideoSeeking() {
	RenderChatHistory(false);
}

function findMessage(elem) {
	while (!elem?.message) {
		elem = elem.parentElement;
	}
	return elem?.message;
}

function onSeekMessageClicked(ev) {
	const msg = findMessage(ev.currentTarget);
	if (msg != undefined && AppState.video_element != undefined) {
		AppState.video_element.currentTime=  msg.content_offset_seconds;
	}
}

async function SetupAppState() {
	if (AppState.initialized_failed)
		return;

	if (!AppState.chat_template) {
		AppState.chat_template = document.createElement('template');
		AppState.chat_template.innerHTML = `
<div class="tw-chat-message">
	<div class="col">
		<button class="tw-timestamp" title="Jump to Video"><span class="text-content"></span></button>
	</div>
	<div class="col">
		<span class="tw-user-container"><a class="tw-username"></a></span><span>: </span>
		<span class="tw-message-body"></span>
	</div>
</div>
`;
	}

	if (!AppState.is_initialized) {
		AppState.video_element = document.querySelector('ytd-player#ytd-player video.html5-main-video');
		if (AppState.video_element != undefined && SetupChatContainer()) {
			AppState.video_element.addEventListener('seeking', onVideoSeeking);
			AppState.video_element.addEventListener('timeupdate', onVideoTimeUpdate);

			AppState.emote_fetcher = new EmoteFetcher('kd1unb4b3q4t58fwlpcbzcbnm76a8fp', '');
			AppState.emote_renderer = new EmoteRenderer(AppState.emote_fetcher);
			await Promise.all([
				// BTTV global
				AppState.emote_fetcher.fetchBTTVEmotes(),
				// 7TV global
				AppState.emote_fetcher.fetchSevenTVEmotes(),
				// FFZ global
				AppState.emote_fetcher.fetchFFZEmotes(),
			]);
			AppState.is_initialized = true;
		}
	}
}

function SetupChatContainer() {
	if (AppState.chat_container === undefined) {
		const chat_container = document.querySelector('#chat-container');
		if (chat_container == undefined)
			return false;

		const container = document.createElement('div');
		container.innerHTML = `
<div class="tw-chat-header"><span>VOD Chat</span></div>
<div class="tw-chat-messages">
	<div class="tw-ul-wrapper">
		<ul class="twitch-chat-list"></ul>
	</div>
</div>
`;
		container.classList.add('twitch-chat-container', 'hidden');
		chat_container.appendChild(container);
		AppState.chat_container = container;
		AppState.chat_list = container.querySelector('ul.twitch-chat-list');
	}

	return true;
}
function pad2(num) {
    var s = "00" + num;
    return s.substring(s.length-2);
}
function formatTime(seconds) {
	if (seconds >= 60*60) {
		return `${Math.floor(seconds/60/60)}:${pad2(Math.floor(seconds/60)%60)}:${pad2(Math.floor(seconds)%60)}`;
	} else {
		return `${pad2(Math.floor(seconds/60)%60)}:${pad2(Math.floor(seconds)%60)}`;
	}
}

function buildChatMessage(message) {
	const chat_msg = AppState.chat_template.content.cloneNode(true);
	
	const time = chat_msg.querySelector('button.tw-timestamp');
	time.querySelector('.text-content').innerText = formatTime(message.content_offset_seconds);
	time.addEventListener('click', onSeekMessageClicked);
	
	const user_container = chat_msg.querySelector('.tw-user-container');
	user_container.style.color = message.message.user_color;

	const user_link = chat_msg.querySelector('a.tw-username');
	user_link.target = "_blank";
	user_link.href = "https://twitch.tv/" + message.commenter.name;
	user_link.innerText = message.commenter.display_name;

	for (let badge of message.message.user_badges || []) {
		const badge_content = AppState.active_chat_history.embedded_data?.twitch_badges[badge._id]?.versions[badge.version];
		if (badge_content != null) {
			const badge_span = document.createElement('span');
			const badge_img = document.createElement('img');
			badge_img.src = "data:image/png;base64,"+badge_content.bytes;
			badge_img.title = badge_content.title;
			badge_img.ariaDescription = badge_content.description;
			badge_span.appendChild(badge_img);
			badge_span.classList.add('tw-badge');
			user_container.prepend(badge_span);
		} else {
			console.warn(`Badge ${badge._id} not found`);
		}
	}

	const message_body = chat_msg.querySelector('.tw-message-body');
	const message_parts = AppState.emote_renderer.parseMessage(message.message);
	for (let child of message_parts) {
		message_body.appendChild(child);
	}

	const element = document.createElement('li');
	element.appendChild(chat_msg);
	element.message = message;
	return element;
}

function RenderChatHistory(rerender) {
	if (AppState.is_initialized && AppState.active_chat_history.loaded) {
		const current_time = AppState.video_element.currentTime;
		
		let message_index = AppState.active_chat_history.current_message_index;
		if (// If we don't want to rerender
			!rerender
			// And current_time is after the currently displayed message (or there is no previous message)
			&& (message_index < 0 || AppState.active_chat_history.messages[message_index].content_offset_seconds <= current_time)
			// And current_time is before the next message to be displayed (or there is no next message)
			&& (message_index >= AppState.active_chat_history.messages.length-1 || AppState.active_chat_history.messages[message_index+1].content_offset_seconds > current_time))
		{
			// Then there's nothing to do
			return;
		}
		
		const ul = AppState.chat_list;
		if (rerender) {
			while (ul.lastChild) {
				ul.removeChild(ul.lastChild);
			}
			message_index = 0;
		} else {
			// Only remove messages that are after the current video time
			while ((ul.lastChild?.message?.content_offset_seconds ?? -1) > current_time) {
				ul.removeChild(ul.lastChild);
				message_index--;
			}
			message_index++;
		}

		for (; message_index < AppState.active_chat_history.messages.length; message_index++) {
			const message = AppState.active_chat_history.messages[message_index];

			if (message.content_offset_seconds > current_time) {
				break;
			}

			const chat_element = buildChatMessage(message);
			ul.appendChild(chat_element);
		}

		AppState.active_chat_history.current_message_index = message_index-1;

		if (ul.lastChild) {
			ul.lastChild.scrollIntoView(false);
		}
	}
}

async function ApplyChatForVideo(search_params) {
	if (AppState.is_initialized) {
		const query = new URLSearchParams(search_params);
		const video_id = query.get('v');

		if (video_id != undefined) {
			if (AppState.active_chat_history.loaded && AppState.active_chat_history.for_video_id == video_id) {
				console.trace("Video id already loaded");
			} else {
				const chat_data = await browser.runtime.sendMessage({type: 'get-chat-data', video_id})
				AppState.active_chat_history.current_message_index = -1;
				AppState.active_chat_history.for_video_id = video_id;
				AppState.active_chat_history.messages = chat_data.messages ?? [];
				AppState.active_chat_history.embedded_data = chat_data.embedded_data;
				AppState.active_chat_history.channel_id = chat_data.channel_id;
				
				if (chat_data.messages != null) {
					await AppState.emote_renderer.setChannelIdAsync(chat_data.channel_id);
					
					AppState.active_chat_history.loaded = true;
					RenderChatHistory(true);
				} else {
					AppState.active_chat_history.loaded = false;
				}
			}
		} else {
			AppState.active_chat_history.loaded = false;
			AppState.active_chat_history.for_video_id = undefined;
		}

		if (AppState.active_chat_history.loaded) {
			AppState.chat_container.classList.remove("hidden");
		} else {
			AppState.chat_container.classList.add("hidden");
		}
	}
}

function injectStyles(url) {
	const elem = document.createElement('link');
	elem.rel = 'stylesheet';
	elem.setAttribute('href', url);
	document.body.appendChild(elem);
}

injectStyles(browser.runtime.getURL('content/style.css'));
TryInitialize();
