const CACHE_NAME = 'gh-uploader-v2';

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Forces the new service worker to activate immediately
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Intercept the Share Target POST request from Android
    if (event.request.method === 'POST' && url.pathname.includes('/share')) {
        event.respondWith((async () => {
            try {
                const formData = await event.request.formData();
                const files = formData.getAll('shared_files');

                if (files && files.length > 0) {
                    const cache = await caches.open('shared-files');
                    const fileNames = [];
                    
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        fileNames.push(file.name);
                        
                        // Store the actual file blob in cache
                        await cache.put(`/shared-file-${i}`, new Response(file));
                    }
                    
                    // Store metadata so index.html knows how many files to pull
                    await cache.put('/shared-file-count', new Response(files.length.toString()));
                    await cache.put('/shared-file-names', new Response(JSON.stringify(fileNames)));
                }
            } catch (error) {
                console.error("Error processing shared files:", error);
            }

            // Redirect back to the main app page to process the upload
            return Response.redirect('./index.html', 303);
        })());
        return;
    }

    // Standard fetch behavior for everything else
    event.respondWith(fetch(event.request).catch(() => {}));
});
