window.addEventListener('DOMContentLoaded', updateStatus);

async function updateStatus() {
    const status = await chrome.runtime.sendMessage({type: 'get-status'});
    document.querySelector('#video_count').innerText = status.video_count;
    document.querySelector('#repo_count').innerText = status.repository_count;
}
