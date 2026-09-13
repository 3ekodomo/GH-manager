const CACHE_NAME = 'gh-uploader-v4';
const SHARE_CACHE = 'gh-uploader-shared';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        await self.clients.claim();
        // Remove old shared-file cache if it exists.
        try { await caches.delete('shared-files'); } catch (_) {}
    })());
});

function isShareTargetRequest(request, url) {
    if (request.method !== 'POST') return false;
    // Android/Web Share Target should send multipart/form-data. The query is
    // useful too, but don't depend on it because some browsers rewrite it.
    const contentType = request.headers.get('content-type') || '';
    return url.pathname.endsWith('/share-target') ||
           url.searchParams.has('share-target') ||
           contentType.toLowerCase().includes('multipart/form-data');
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (isShareTargetRequest(event.request, url)) {
        event.respondWith((async () => {
            const request = event.request;

            try {
                const formData = await request.formData();
                const files = [];

                // The manifest names the file field "shared_files".
                for (const value of formData.getAll('shared_files')) {
                    if (value instanceof File) {
                        files.push(value);
                    } else if (typeof value === 'string' && value) {
                        files.push(new File([value], 'shared_text.txt', {type: 'text/plain'}));
                    }
                }

                // Browser/OS fallback: find File values under any field name.
                if (files.length === 0) {
                    for (const [, value] of formData.entries()) {
                        if (value instanceof File) files.push(value);
                    }
                }

                // Text-only sharing fallback.
                if (files.length === 0) {
                    const title = formData.get('title');
                    const text = formData.get('text');
                    if (title || text) {
                        files.push(new File(
                            [[title, text].filter(Boolean).join('\n\n')],
                            'shared_content.txt',
                            {type: 'text/plain'}
                        ));
                    }
                }

                if (files.length > 0) {
                    const cache = await caches.open(SHARE_CACHE);
                    const id = `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
                    const keys = [];

                    for (let i = 0; i < files.length; i++) {
                        const key = `/__gh_shared__/${id}/${i}`;
                        await cache.put(key, new Response(files[i]));
                        keys.push(key);
                    }

                    await cache.put(`/__gh_shared__/${id}/meta`, new Response(JSON.stringify({
                        keys,
                        names: files.map(file => file.name || ''),
                        types: files.map(file => file.type || '')
                    }), {headers: {'Content-Type': 'application/json'}}));

                    // Pass only an opaque transfer id in the URL. The actual
                    // file data remains in the Cache Storage until the page
                    // consumes it.
                    return Response.redirect(`./index.html?shared=${encodeURIComponent(id)}`, 303);
                }
            } catch (error) {
                console.error('Share Target processing failed:', error);
            }

            // Still open the app if the shared payload could not be read.
            return Response.redirect('./index.html', 303);
        })());
        return;
    }

    // Never interfere with normal GET requests.
    event.respondWith(fetch(event.request));
});
