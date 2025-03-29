if (typeof browser == "undefined") {
    globalThis.browser = chrome; // Chrome does not support the browser namespace yet.
}

window.addEventListener('DOMContentLoaded', domContentLoaded);

async function domContentLoaded() {
    const task = reloadRepositoryList();
    
    document.querySelector('button.reload').addEventListener('click', reloadRepositoryList);
    document.querySelector('button.load-repositories').addEventListener('click', loadRepositories);
    document.querySelector('form.add-repository').addEventListener('submit', addRepositoryClick);

    await task;
}

async function loadRepositories() {
    await browser.runtime.sendMessage({type:'load-repositories'});
    await reloadRepositoryList();
}

async function reloadRepositoryList() {
    const repositories = await browser.runtime.sendMessage({type: 'get-repositories'});
    const repo_container = document.querySelector('#repo_container');
    while (repo_container.lastChild) {
        repo_container.removeChild(repo_container.lastChild);
    }

    const template = document.querySelector('#repo_template').content;

    let repo_id = 0;
    for (let repo of repositories) {
        repo_id++;

        const element = template.cloneNode(true);
        let repo_status = repo.status;
        if (repo_status === 'loaded') {
            repo_status += `, ${Object.keys(repo.videos).length} videos`;
        }
        element.querySelector('span.repo_name').textContent = repo.url;
        element.querySelector('span.repo_status').textContent = repo_status;

        const collapse_btn = element.querySelector('button.video-list-collapse');
        element.querySelector(collapse_btn.dataset.bsTarget).classList.add('repo' + repo_id)
        collapse_btn.dataset.bsTarget += '.repo' + repo_id;
        element.querySelector('button.btn-remove-repository').addEventListener('click', async () => {
            if (confirm(`Delete '${repo.url}'?`)) {
                const result = await browser.runtime.sendMessage({type: 'remove-repository', url: repo.url});
                console.log(result);
                if (result.success) {
                    await reloadRepositoryList();
                }
            }
        });
        element.querySelector('button.btn-reload-repository').addEventListener('click', async () => {
            const result = await browser.runtime.sendMessage({type: 'reload-repository', url: repo.url});
            console.log(result);
            if (result.success) {
                await reloadRepositoryList();
            }
        });

        if (repo.videos != undefined) {
            const list = element.querySelector('ul.video-list');
            for (let video in repo.videos) {
                const link = document.createElement('a');
                link.href = 'https://youtube.com/watch?v='+video;
                link.textContent = `${repo.videos[video].title} (${link.href})`;
                const li = document.createElement('li');
                li.appendChild(link);
                li.classList.add('list-group-item');
                list.appendChild(li);
            }
        }
        repo_container.appendChild(element);
    }
}

async function addRepositoryClick(e) {
    e.preventDefault();

    const repo_input = document.querySelector('input.repository-input');
    const repo_error = document.querySelector('span.repository-error');
    const repo_url = repo_input.value.trim();

    if (repo_url.length == 0) {
        repo_input.value = '';
        repo_error.innerText = '';
        return;
    }

    const result = await browser.runtime.sendMessage({ type: 'add-repository', url: repo_url });
    if (result.success) {
        repo_input.value = '';
        repo_error.innerText = '';
        await reloadRepositoryList();
    } else {
        repo_error.innerText = result.error_message;
    }
}
