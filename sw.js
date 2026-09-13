const CACHE_NAME = 'gh-uploader-v5';
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
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    // The manifest action is the app root. Keep /share-target as a backwards-
    // compatible endpoint for older installed versions.
    return url.pathname === new URL('./', self.registration.scope).pathname ||
           url.pathname.endsWith('/share-target') ||
           contentType.includes('multipart/form-data') ||
           contentType.includes('application/x-www-form-urlencoded');
}

async function saveSharedPayload(formData) {
    const files = [];

    // Preferred field generated from manifest.json.
    for (const value of formData.getAll('shared_files')) {
        if (value instanceof File) files.push(value);
    }

    // Some Android share providers rename the multipart field. Collect every
    // File value instead of depending on one field name.
    if (files.length === 0) {
        for (const [, value] of formData.entries()) {
            if (value instanceof File) files.push(value);
        }
    }

    // Text-only shares are still useful: expose them as a text file.
    if (files.length === 0) {
        const title = formData.get('title');
        const text = formData.get('text');
        const content = [title, text].filter(v => typeof v === 'string' && v.trim()).join('\n\n');
        if (content) {
            files.push(new File([content], 'shared_content.txt', { type: 'text/plain' }));
        }
    }

    if (files.length === 0) return null;

    const cache = await caches.open(SHARE_CACHE);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const keys = [];

    for (let i = 0; i < files.length; i++) {
        const key = new URL(`./__gh_shared__/${id}/${i}`, self.registration.scope).href;
        await cache.put(key, new Response(files[i], {
            headers: {
                'Content-Type': files[i].type || 'application/octet-stream',
                'X-Shared-Filename': encodeURIComponent(files[i].name || '')
            }
        }));
        keys.push(key);
    }

    const metaKey = new URL(`./__gh_shared__/${id}/meta`, self.registration.scope).href;
    await cache.put(metaKey, new Response(JSON.stringify({
        keys,
        names: files.map(file => file.name || ''),
        types: files.map(file => file.type || '')
    }), { headers: { 'Content-Type': 'application/json' } }));

    return id;
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (!isShareTargetRequest(event.request, url)) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith((async () => {
        try {
            const id = await saveSharedPayload(await event.request.formData());
            if (id) {
                const destination = new URL('./', self.registration.scope);
                destination.searchParams.set('shared', id);
                return Response.redirect(destination.href, 303);
            }
        } catch (error) {
            console.error('Share Target processing failed:', error);
        }

        return Response.redirect(new URL('./', self.registration.scope).href, 303);
    })());
});

