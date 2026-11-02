// Replaces EmDash's database sitemap (EmDash skips its own when this route exists): built from the
// snapshot with the real public paths, prerendered like the pages it lists.
import type { APIRoute } from "astro";
import { loadShopContent } from "../lib/shop/page";
import { sitemapPaths, sitemapXml } from "../lib/shop/seo";

export const prerender = true;

export const GET: APIRoute = async ({ site, url }) =>
	new Response(sitemapXml(sitemapPaths(await loadShopContent()), site ?? url), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
