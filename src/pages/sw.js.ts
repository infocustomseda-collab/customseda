// Service worker, prerendered per build: a new build gets a new cache version, and the page offers
// the update. Routing rules live in src/lib/pwa/strategy.js (tested) and are inlined here.
import type { APIRoute } from "astro";
import strategy from "../lib/pwa/strategy.js?raw";

export const prerender = true;

// Computed per request: workerd (which prerenders) reports time 0 at module scope.
const worker = (version: string) => `const CACHE = "seda-${version}";
const OFFLINE = "/offline";
${strategy.replace(/^export /gm, "")}

self.addEventListener("install", (event) => {
	event.waitUntil((async () => {
		const cache = await caches.open(CACHE);
		const response = await fetch(OFFLINE, { cache: "reload" });
		if (!response.ok) throw new Error("Offline page unavailable");
		const html = await response.clone().text();
		await cache.put(OFFLINE, response);
		await cache.addAll([...new Set(html.match(/\\/_astro\\/[^"'\\s)]+/g) ?? [])]);
	})());
});

self.addEventListener("activate", (event) => {
	event.waitUntil((async () => {
		for (const key of await caches.keys()) if (key.startsWith("seda-") && key !== CACHE) await caches.delete(key);
		await self.clients.claim();
	})());
});

self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;
	const rule = routeStrategy(url, event.request.method);
	if (rule !== "network-only") event.respondWith(respond(rule, event.request));
});

async function respond(rule, request) {
	const cache = await caches.open(CACHE);
	const remember = (response) => {
		if (response.ok) cache.put(request, response.clone());
		return response;
	};
	if (rule === "cache-first") return (await cache.match(request)) ?? fetch(request).then(remember);
	if (rule === "stale-while-revalidate") {
		const network = fetch(request).then(remember);
		const hit = await cache.match(request);
		if (hit) {
			network.catch(() => {});
			return hit;
		}
		return network;
	}
	// network-first: pages stay fresh online; visited pages and the offline page serve offline.
	try {
		const response = await fetch(request);
		return keepsForOffline(request.mode, response.headers.get("Content-Type")) ? remember(response) : response;
	} catch {
		return (await cache.match(request, { ignoreSearch: true })) ?? (request.mode === "navigate" ? await cache.match(OFFLINE) : undefined) ?? Response.error();
	}
}
`;

export const GET: APIRoute = () => new Response(worker(Date.now().toString(36)), { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
