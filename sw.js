const CACHE_NAME = 'gh-uploader-v3';

self.addEventListener('install', (event) => {
    // Force the waiting service worker to become the active service worker.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Claim any clients immediately so the new SW takes over.
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Intercept the Share Target POST request reliably using a query parameter
    if (event.request.method === 'POST' && url.search.includes('share=true')) {
        event.respondWith((async () => {
            try {
                const formData = await event.request.formData();
                let allFiles = [];

                // 1. Check for standard 'shared_files' from manifest
                const sharedFiles = formData.getAll('shared_files');
                if (sharedFiles && sharedFiles.length > 0) {
                    for (const item of sharedFiles) {
                        if (typeof item === 'string') {
                            // Convert string to a text file
                            allFiles.push(new File([item], 'shared_text.txt', { type: 'text/plain' }));
                        } else {
                            allFiles.push(item);
                        }
                    }
                }

                // 2. Fallback: Iterate over all formData entries to find any File objects
                // In case the OS appended files under a different field name
                if (allFiles.length === 0) {
                    for (const [key, value] of formData.entries()) {
                        if (value && typeof value === 'object' && 'name' in value) {
                            allFiles.push(value);
                        }
                    }
                }

                // 3. Fallback: If no files were found, check if title or text was shared
                if (allFiles.length === 0) {
                    const text = formData.get('text');
                    const title = formData.get('title');
                    if (text || title) {
                        const content = [title, text].filter(Boolean).join('\n\n');
                        allFiles.push(new File([content], 'shared_content.txt', { type: 'text/plain' }));
                    }
                }

                if (allFiles.length > 0) {
                    const cache = await caches.open('shared-files');
                    const fileNames = [];
                    
                    for (let i = 0; i < allFiles.length; i++) {
                        const file = allFiles[i];
                        fileNames.push(file.name);
                        
                        // Store the actual file blob in cache
                        await cache.put(`/shared-file-${i}`, new Response(file));
                    }
                    
                    // Store metadata so index.html knows how many files to pull
                    await cache.put('/shared-file-count', new Response(allFiles.length.toString()));
                    await cache.put('/shared-file-names', new Response(JSON.stringify(fileNames)));
                }
            } catch (error) {
                console.error("Error processing shared files:", error);
            }

            // Redirect back to the clean URL
            return Response.redirect('./index.html', 303);
        })());
        return;
    }

    // Standard fetch behavior for everything else
    event.respondWith(fetch(event.request).catch(() => {}));
});
