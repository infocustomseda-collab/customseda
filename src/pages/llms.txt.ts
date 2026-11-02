// llms.txt for AI assistants and crawlers: the shop summary, catalog and pages from the snapshot.
import type { APIRoute } from "astro";
import { loadShopContent } from "../lib/shop/page";
import { llmsText } from "../lib/shop/seo";

export const prerender = true;

export const GET: APIRoute = async ({ site, url }) =>
	new Response(llmsText(await loadShopContent(), site ?? url), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
