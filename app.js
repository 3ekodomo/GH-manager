document.addEventListener('DOMContentLoaded', () => {
    // --- Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }

    // --- DOM Elements ---
    const tokenInput = document.getElementById('gh-token');
    const repoInput = document.getElementById('gh-repo');
    const folderInput = document.getElementById('gh-folder');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const statusMsg = document.getElementById('status-message');
    const historyList = document.getElementById('history-list');
    const themeSelector = document.getElementById('theme-selector');
    const themeMeta = document.getElementById('theme-meta');

    // Tab Elements
    const tabUploadBtn = document.getElementById('tab-upload-btn');
    const tabManageBtn = document.getElementById('tab-manage-btn');
    const uploadView = document.getElementById('upload-view');
    const manageView = document.getElementById('manage-view');

    // Manager Elements
    const managerPath = document.getElementById('manager-path');
    const refreshDirBtn = document.getElementById('refresh-dir-btn');
    const managerStatus = document.getElementById('manager-status');
    const repoFileList = document.getElementById('repo-file-list');

    // --- Tab Navigation Logic ---
    tabUploadBtn.addEventListener('click', () => {
        uploadView.style.display = 'block';
        manageView.style.display = 'none';
        tabUploadBtn.classList.add('active-tab');
        tabManageBtn.classList.remove('active-tab');
    });

    tabManageBtn.addEventListener('click', () => {
        uploadView.style.display = 'none';
        manageView.style.display = 'block';
        tabManageBtn.classList.add('active-tab');
        tabUploadBtn.classList.remove('active-tab');
        if (repoFileList.innerHTML === '') loadRepoFiles(); 
    });

    // --- Dynamic Status Bar & Theme Management ---
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (themeMeta) {
            if (theme === 'dark') themeMeta.content = '#0d1117';
            else if (theme === 'black') themeMeta.content = '#000000';
            else themeMeta.content = '#f6f8fa'; 
        }
    }

    const savedTheme = localStorage.getItem('ghTheme') || 'light';
    applyTheme(savedTheme);
    if(themeSelector) themeSelector.value = savedTheme;

    if(themeSelector) {
        themeSelector.addEventListener('change', (e) => {
            applyTheme(e.target.value);
            localStorage.setItem('ghTheme', e.target.value);
        });
    }

    // --- Load Saved Credentials ---
    tokenInput.value = localStorage.getItem('ghToken') || '';
    repoInput.value = localStorage.getItem('ghRepo') || '';
    if(folderInput) folderInput.value = localStorage.getItem('ghFolder') || '';

    checkSharedFiles();

    // --- jsDelivr URL Converter ---
    function getCdnUrl(rawUrl) {
        if (!rawUrl) return '';
        return rawUrl.replace(
            /raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\//, 
            'cdn.jsdelivr.net/gh/$1/$2@$3/'
        );
    }

    // --- Paste from Clipboard Logic ---
    if(pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const clipboardItems = await navigator.clipboard.read();
                const dataTransfer = new DataTransfer();
                
                for (const item of clipboardItems) {
                    const imageTypes = item.types.filter(type => type.startsWith('image/'));
                    for (const type of imageTypes) {
                        const blob = await item.getType(type);
                        const file = new File([blob], `pasted_${Date.now()}.${type.split('/')[1]}`, { type });
                        dataTransfer.items.add(file);
                    }
                }

                if (dataTransfer.files.length > 0) {
                    fileInput.files = dataTransfer.files;
                    statusMsg.innerText = `${dataTransfer.files.length} image(s) pasted!`;
                } else {
                    alert('No image found in clipboard.');
                }
            } catch (err) {
                console.error('Failed to read clipboard', err);
                alert('Clipboard access denied or empty.');
            }
        });
    }

    // --- Multiple Upload Logic ---
    uploadBtn.addEventListener('click', async () => {
        const files = Array.from(fileInput.files);
        if (files.length === 0) return alert('Please select a file.');

        const token = tokenInput.value.trim();
        const repo = repoInput.value.trim();
        const folder = folderInput ? folderInput.value.trim() : '';
        
        if (!token || !repo) return alert('Token and Repo are required.');

        localStorage.setItem('ghToken', token);
        localStorage.setItem('ghRepo', repo);
        if(folderInput) localStorage.setItem('ghFolder', folder);

        uploadBtn.disabled = true;
        let successCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            statusMsg.innerText = `Uploading ${i + 1} of ${files.length}...`;
            
            try {
                const base64Data = await toBase64(file);
                const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
                const path = folder ? `${folder}/${fileName}` : fileName;

                const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Upload ${fileName}`,
                        content: base64Data
                    })
                });

                const data = await response.json();
                if (response.ok) {
                    successCount++;
                    const cdnUrl = getCdnUrl(data.content.download_url);
                    saveToHistory(cdnUrl, file.type);
                } else {
                    console.error(`Error uploading ${file.name}:`, data.message);
                }
            } catch (error) {
                console.error(`Catch error on ${file.name}:`, error);
            }
        }

        statusMsg.innerText = `Successfully uploaded ${successCount} out of ${files.length} files.`;
        uploadBtn.disabled = false;
        fileInput.value = ''; 
        renderHistory();
    });

    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    }

    function saveToHistory(url, type) {
        let history = JSON.parse(localStorage.getItem('ghHistory')) || [];
        history.unshift({ url, type, date: new Date().toLocaleString() });
        localStorage.setItem('ghHistory', JSON.stringify(history));
    }

    // --- Render History List ---
    function renderHistory() {
        historyList.innerHTML = '';
        let history = JSON.parse(localStorage.getItem('ghHistory')) || [];

        history.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            
            const isImage = item.type.startsWith('image/');
            const thumb = isImage 
                ? `<img src="${item.url}" class="history-thumb" onclick="window.open('${item.url}', '_blank')" alt="thumbnail">` 
                : `<div class="history-thumb" onclick="window.open('${item.url}', '_blank')">${item.type.split('/')[0].toUpperCase() || 'FILE'}</div>`;
            const markdownCode = isImage ? `![Image](${item.url})` : `[File](${item.url})`;

            div.innerHTML = `
                ${thumb}
                <div class="history-details">
                    <label>Direct Link: (Tap to copy)</label>
                    <input type="text" value="${item.url}" readonly onclick="copyToClipboard(this)">
                    <label>Markdown: (Tap to copy)</label>
                    <input type="text" value="${markdownCode}" readonly onclick="copyToClipboard(this)">
                    <button class="delete-btn" onclick="deleteHistoryItem(${index})">Delete from History</button>
                </div>
            `;
            historyList.appendChild(div);
        });
    }

    // --- File Manager Logic ---
    refreshDirBtn.addEventListener('click', loadRepoFiles);

    async function loadRepoFiles() {
        const token = tokenInput.value.trim();
        const repo = repoInput.value.trim();
        let path = managerPath.value.trim();

        if (!token || !repo) return alert('Token and Repo are required.');

        managerStatus.innerText = 'Loading files...';
        repoFileList.innerHTML = '';

        try {
            const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load directory. Ensure path is correct.');

            const files = await response.json();
            managerStatus.innerText = '';

            const fileArray = Array.isArray(files) ? files : [files];

            fileArray.forEach(file => {
                const div = document.createElement('div');
                div.className = 'repo-item';
                
                const isImage = file.name.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i);
                const cdnUrl = file.download_url ? getCdnUrl(file.download_url) : '';
                
                // Construct thumbnail and click handlers
                const isFile = file.type === 'file';
                const fileClickHandler = isFile ? `window.open('${cdnUrl}', '_blank')` : `document.getElementById('manager-path').value = '${file.path}'; document.getElementById('refresh-dir-btn').click();`;

                const thumbHtml = isFile
                    ? (isImage 
                        ? `<img src="${cdnUrl}" class="manager-thumb" onclick="${fileClickHandler}" alt="preview">` 
                        : `<div class="manager-thumb" onclick="${fileClickHandler}">FILE</div>`)
                    : `<div class="manager-thumb" onclick="${fileClickHandler}">DIR</div>`;

                div.innerHTML = `
                    ${thumbHtml}
                    <div class="repo-item-info" onclick="${fileClickHandler}">
                        <div class="repo-item-name">${file.name}</div>
                        <div class="repo-item-type">${file.type}</div>
                    </div>
                    ${isFile ? `
                    <div class="repo-actions">
                        <button class="btn-move" onclick="renameFile('${file.path}', '${file.sha}')">Move</button>
                        <button class="delete-btn" onclick="deleteRemoteFile('${file.path}', '${file.sha}')">Delete</button>
                    </div>
                    ` : `
                    <div class="repo-actions">
                        <button class="btn-move" onclick="${fileClickHandler}">Open Dir</button>
                    </div>
                    `}
                `;
                repoFileList.appendChild(div);
            });

        } catch (error) {
            managerStatus.innerText = error.message;
        }
    }

    // --- Global Functions (Clipboard, Delete, Rename) ---
    window.copyToClipboard = function(element) {
        element.select();
        navigator.clipboard.writeText(element.value);
        
        const originalBg = element.style.backgroundColor;
        const originalColor = element.style.color;
        
        element.style.backgroundColor = '#2ea44f';
        element.style.color = '#fff';
        
        setTimeout(() => {
            element.style.backgroundColor = originalBg;
            element.style.color = originalColor;
        }, 300);
    }

    window.deleteHistoryItem = function(index) {
        let history = JSON.parse(localStorage.getItem('ghHistory')) || [];
        history.splice(index, 1);
        localStorage.setItem('ghHistory', JSON.stringify(history));
        renderHistory();
    }

    window.deleteRemoteFile = async function(path, sha) {
        if (!confirm(`Are you sure you want to delete ${path}?`)) return;

        const token = tokenInput.value.trim();
        const repo = repoInput.value.trim();
        managerStatus.innerText = `Deleting ${path}...`;

        try {
            const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Delete ${path} via Manager`,
                    sha: sha
                })
            });

            if (response.ok) {
                alert('File deleted successfully.');
                loadRepoFiles();
            } else {
                const data = await response.json();
                throw new Error(data.message);
            }
        } catch (error) {
            alert(`Delete failed: ${error.message}`);
            managerStatus.innerText = '';
        }
    }

    window.renameFile = async function(oldPath, sha) {
        const newPath = prompt(`Enter new path/name for this file (e.g., newfolder/newname.ext):`, oldPath);
        if (!newPath || newPath === oldPath) return;

        const token = tokenInput.value.trim();
        const repo = repoInput.value.trim();
        managerStatus.innerText = `Moving ${oldPath} to ${newPath}...`;

        try {
            // STEP 1: Get content via Git Blobs API (bypasses 1MB limit on contents API)
            const getRes = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${sha}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!getRes.ok) throw new Error("Failed to fetch source file data from GitHub.");
            const blobData = await getRes.json();
            
            if (!blobData.content) {
                throw new Error("File content could not be read.");
            }

            // STEP 2: Create new file using the base64 content
            const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${newPath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Move ${oldPath} to ${newPath}`,
                    content: blobData.content.replace(/\n/g, '') // Strip breaks from base64
                })
            });

            if (!putRes.ok) throw new Error("Failed to create the new file at destination.");

            // STEP 3: Delete old file
            const delRes = await fetch(`https://api.github.com/repos/${repo}/contents/${oldPath}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Cleanup old file after moving to ${newPath}`,
                    sha: sha
                })
            });

            if (delRes.ok) {
                alert('File moved/renamed successfully!');
                loadRepoFiles();
            }
        } catch (error) {
            alert(`Operation failed: ${error.message}`);
            managerStatus.innerText = '';
        }
    }

    // --- PWA File Share Extraction ---
    async function checkSharedFiles() {
        if ('caches' in window) {
            const cache = await caches.open('shared-files');
            const countRes = await cache.match('/shared-file-count');
            
            if (countRes) {
                const count = parseInt(await countRes.text());
                const dataTransfer = new DataTransfer();
                
                for (let i = 0; i < count; i++) {
                    const res = await cache.match(`/shared-file-${i}`);
                    if (res) {
                        const blob = await res.blob();
                        const file = new File([blob], `shared_upload_${i}_${Date.now()}`, { type: blob.type });
                        dataTransfer.items.add(file);
                        await cache.delete(`/shared-file-${i}`);
                    }
                }
                
                await cache.delete('/shared-file-count');
                if (dataTransfer.files.length > 0) {
                    fileInput.files = dataTransfer.files;
                    statusMsg.innerText = `${dataTransfer.files.length} shared file(s) ready to upload!`;
                }
            }
        }
    }

    renderHistory();
});
