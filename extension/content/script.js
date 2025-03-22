if (typeof browser == "undefined") {
    globalThis.browser = chrome; // Chrome does not support the browser namespace yet.
}

const AppState = {
	is_initialized: false,
	initialized_failed: false,
	video_element: undefined,
	chat_container: undefined,
	chat_list: undefined,
	active_chat_history: {
		loaded: false,
		for_video_id: undefined,
		messages: [],
		current_message_index: -1,
		embedded_data: null,
	},
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

function onMessageClicked(ev) {
	let msg = ev.currentTarget.message;
	if (msg != undefined && AppState.video_element != undefined) {
		AppState.video_element.currentTime=  msg.content_offset_seconds;
	}
}

async function SetupAppState() {
	if (AppState.initialized_failed)
		return;

	if (!AppState.is_initialized) {
		AppState.video_element = document.querySelector('ytd-player video.html5-main-video');
		if (AppState.video_element != undefined && SetupChatContainer()) {
			AppState.video_element.addEventListener('seeking', onVideoSeeking);
			AppState.video_element.addEventListener('timeupdate', onVideoTimeUpdate);
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
		const list = document.createElement('ul');

		container.classList.add('twitch-chat-container', 'hidden');
		list.classList.add('twitch-chat-list');
		container.appendChild(list);
		chat_container.appendChild(container);
		AppState.chat_container = container;
		AppState.chat_list = list;
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
	let time = document.createElement('span');
	time.innerText = `[${formatTime(message.content_offset_seconds)}]`;

	let commenter = document.createElement('span');
	let commenter_link = document.createElement('a');
	commenter_link.target = "_blank";
	commenter_link.href = "https://twitch.tv/" + message.commenter.name;
	commenter_link.innerText = message.commenter.display_name;
	commenter.style.color = message.message.user_color;
	commenter.appendChild(commenter_link);

	for (let badge of message.message.user_badges) {
		const badge_content = AppState.active_chat_history.embedded_data?.twitch_badges[badge._id]?.versions[badge.version];
		if (badge_content != null) {
			const badge_span = document.createElement('span');
			const badge_img = document.createElement('img');
			badge_img.src = "data:image/png;base64,"+badge_content.bytes;
			badge_img.width = 16;
			badge_img.height = 16;
			badge_img.title = badge_content.title;
			badge_img.ariaDescription = badge_content.description;
			badge_span.appendChild(badge_img);
			commenter.prepend(badge_span);
		} else {
			console.warn(`Badge ${badge._id} not found`);
		}
	}

	let message_body = document.createElement('span');
	message_body.innerText = message.message.body;

	let element = document.createElement('li');
	element.appendChild(time);
	element.append(' ');
	element.appendChild(commenter);
	element.append(': ');
	element.appendChild(message_body);

	element.message = message;
	element.addEventListener('click', onMessageClicked);
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
				AppState.active_chat_history.loaded = chat_data.messages != null;
				AppState.active_chat_history.messages = chat_data.messages ?? [];
				AppState.active_chat_history.embedded_data = chat_data.embedded_data;
				if (AppState.active_chat_history.loaded) {
					RenderChatHistory(true);
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

TryInitialize();
