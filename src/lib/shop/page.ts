// Shared data for public shop pages: content (drafts included only in development) and site chrome.
import type { AstroGlobal } from "astro";
import { getMenu } from "emdash";
import { getDb } from "emdash/runtime";
import type { SiteChrome } from "../../layouts/Shop.astro";
import { loadShop, type ShopContent, type ShopEntry } from "./content.ts";
import { popupViews, settingsOf, siteChrome } from "./site.ts";

export type ShopPage = { shop: ShopContent; site: SiteChrome; settings: ShopEntry | undefined };

export async function loadShopPage(Astro: AstroGlobal): Promise<ShopPage> {
	const [shop, primary, footer] = await Promise.all([
		getDb().then((db) => loadShop(db, { drafts: import.meta.env.DEV })),
		getMenu("primary"),
		getMenu("footer"),
	]);
	const settings = settingsOf(shop);
	const site = { ...siteChrome({ settings, primary, footer, path: Astro.url.pathname }), popups: popupViews(shop.popups, Date.now()) };
	return { shop, settings, site };
}

export const byId = (entries: ShopEntry[], id: string | undefined) => entries.find((entry) => entry.id === id);
