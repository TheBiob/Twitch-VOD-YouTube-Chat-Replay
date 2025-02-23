const AppState = {
	video_element: undefined,
	chat_container: undefined,
	active_chat_history: {
		loaded: false,
		for_video_id: undefined,
		messages: [],
		latest_message_time: -1,
		next_message: null,
		next_message_index: 0,
		embedded_data: null,
	},
}

window.addEventListener('load', TryInitialize);
window.navigation.addEventListener('navigate', async (_ev) => {
	console.log('navigate');
	if (_ev.destination.url.indexOf('/watch') >= 0 && _ev.destination.url.indexOf('?') >= 0) {
		await ApplyChatForVideo(_ev.destination.url.substring(_ev.destination.url.indexOf('?')))
	}
	console.log('navigate end');
});

async function TryInitialize() {
	console.log('TryInitialize');
	SetupAppState();
	console.log('TryInitialize end');
	if (AppState.is_initialized) {
		await ApplyChatForVideo(window.location.search);
	} else {
		window.setTimeout(TryInitialize, 1000);
	}
}

function onVideoTimeUpdate() {
	if (AppState.active_chat_history.next_message !== null) {
		let current_time = AppState.video_element.currentTime;
		if (current_time > AppState.active_chat_history.next_message.content_offset_seconds) {
			RenderChatHistory(false);
		}
	}
}

function onVideoSeeking() {
	RenderChatHistory(AppState.active_chat_history.latest_message_time < 0 || AppState.video_element.currentTime < AppState.active_chat_history.latest_message_time);
}

function onMessageClicked(ev) {
	let msg = ev.currentTarget.message;
	if (msg != undefined && AppState.video_element != undefined) {
		AppState.video_element.currentTime=  msg.content_offset_seconds;
	}
}

function SetupAppState() {
	if (!AppState.is_initialized) {
		AppState.video_element = document.querySelector('ytd-player video.html5-main-video');
		if (AppState.video_element != null) {
			AppState.video_element.addEventListener('seeking', onVideoSeeking);
			AppState.video_element.addEventListener('timeupdate', onVideoTimeUpdate);
			SetupChatContainer();
			AppState.is_initialized = true;
			console.info('initialized');
		}
	}
}

function SetupChatContainer() {
	if (AppState.chat_container === undefined) {
		let chat_container = document.querySelector('#chat-container');
		if (chat_container == undefined)
			return;

		let container = document.createElement('div');
		let list = document.createElement('ul');

		container.classList.add('twitch-chat-container');
		list.classList.add('twitch-chat-list');
		container.appendChild(list);
		chat_container.appendChild(container);
		chat_container.classList.add('hidden');
		AppState.chat_container = chat_container;
	}
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
		let badge_content = AppState.active_chat_history.embedded_data.twitch_badges[badge._id]?.versions[badge.version];
		if (badge_content != null) {
			let badge_span = document.createElement('span');
			let badge_img = document.createElement('img');
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
		console.info('Rerender: ', rerender);
		let current_time = AppState.video_element.currentTime;

		let ul = AppState.chat_container.querySelector('ul.twitch-chat-list');
		if (rerender) {
			while (ul.lastChild) {
				ul.removeChild(ul.lastChild);
			}
		}

		let lastElement = undefined;
		let startIndex = rerender ? 0 : AppState.active_chat_history.next_message_index;

		AppState.active_chat_history.next_message = null;
		AppState.active_chat_history.next_message_index = 0;
		for (let index = startIndex; index < AppState.active_chat_history.messages.length; index++) {
			let message = AppState.active_chat_history.messages[index];

			if (message.content_offset_seconds > current_time) {
				AppState.active_chat_history.next_message = message;
				AppState.active_chat_history.next_message_index = index;
				break;
			}

			lastElement = buildChatMessage(message);
			ul.appendChild(lastElement);
		}

		if (lastElement !== undefined) {
			AppState.active_chat_history.latest_message_time = lastElement.message.content_offset_seconds;
			lastElement.scrollIntoView(false);
		} else {
			AppState.active_chat_history.latest_message_time = -1;
		}
	}
}

async function ApplyChatForVideo(search_params) {
	if (AppState.is_initialized) {
		const query = new URLSearchParams(search_params);
		const video_id = query.get('v');

		if (video_id != undefined) {
			console.info(`Video Id: ${video_id}`);

			if (AppState.active_chat_history.loaded && AppState.active_chat_history.for_video_id == video_id) {
				console.info("Video id already loaded");
			} else {
				AppState.active_chat_history.loaded = false;
				AppState.active_chat_history.for_video_id = video_id;
				
				console.info('Fetching chat data');
				let content = await fetch('https://raw.githubusercontent.com/TheBiob/twitch-chat-storage/refs/heads/main/' + video_id + '.json')
				if (content.ok) {
					let json = await content.json();
					if (json != null) {
						AppState.active_chat_history.messages = json.messages;
						AppState.active_chat_history.embedded_data = json.embedded_data;
						AppState.active_chat_history.loaded = true;
						RenderChatHistory(true);
					}
				} else {
					console.warn(`Data for ${video_id} could not be fetched`);
				}
			}
		} else {
			AppState.active_chat_history.loaded = false;
			AppState.active_chat_history.for_video_id = undefined;
			console.warn('no video id');
		}

		if (AppState.active_chat_history.loaded) {
			AppState.chat_container.classList.remove("hidden");
		} else {
			AppState.chat_container.classList.add("hidden");
		}
	}
}
