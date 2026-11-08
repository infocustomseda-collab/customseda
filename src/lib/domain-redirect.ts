/** Move the old public hostname only after production's configured origin changes. */
export function domainRedirect(request: Request, vars: Record<string, unknown>): Response | null {
	const url = new URL(request.url);
	if (vars.SITE_ROLE !== "public" || vars.CMS_ORIGIN || vars.EMDASH_SITE_URL !== "https://customseda.com" || url.hostname !== "customseda.customseda.workers.dev") return null;
	url.protocol = "https:";
	url.host = "customseda.com";
	return new Response(null, { status: 301, headers: { Location: url.toString() } });
}
