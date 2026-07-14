self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.method === 'POST' && event.request.url.endsWith('share-target')) {
        event.respondWith((async () => {
            const formData = await event.request.formData();
            
            // Use getAll to retrieve an array of all shared files
            const files = formData.getAll('file'); 
            
            const cache = await caches.open('shared-files');
            
            // Store each file sequentially
            for (let i = 0; i < files.length; i++) {
                await cache.put(`/shared-file-${i}`, new Response(files[i]));
            }
            
            // Store the total count so app.js knows how many to pull
            await cache.put('/shared-file-count', new Response(files.length.toString()));
            
            return Response.redirect('./index.html', 303);
        })());
    }
});
