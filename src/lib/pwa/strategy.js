// Service-worker routing rules, shared by tests and inlined into /sw.js at build time.
// Anything that charges money, reads live state or administers the site never touches the cache.
export function routeStrategy(url, method) {
	if (method !== "GET") return "network-only";
	const path = url.pathname;
	if (path === "/sw.js" || ["/_emdash/", "/api/", "/checkout/"].some((prefix) => path.startsWith(prefix))) return "network-only";
	if (path.startsWith("/_astro/")) return "cache-first";
	if (["/media/", "/icons/", "/brand/"].some((prefix) => path.startsWith(prefix))) return "stale-while-revalidate";
	return "network-first";
}

// A network-first response kept for offline: full page loads, and pages the ClientRouter fetches
// (mode "cors"), which are identified by their HTML content type.
export function keepsForOffline(mode, contentType) {
	return mode === "navigate" || /^text\/html\b/.test(contentType ?? "");
}
