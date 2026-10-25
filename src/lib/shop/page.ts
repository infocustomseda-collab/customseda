// Shared data for public shop pages: content and site chrome. Development reads live content with
// drafts; builds and deployed live routes read the build-time snapshot, so no page queries D1.
import { getMenu } from "emdash";
import { getDb } from "emdash/runtime";
import type { SiteChrome } from "../../layouts/Shop.astro";
import { loadShop, type ShopContent, type ShopEntry } from "./content.ts";
import { popupViews, settingsOf, siteChrome } from "./site.ts";
import type { ShopSnapshot } from "./snapshot.ts";

export type ShopPage = { shop: ShopContent; site: SiteChrome; settings: ShopEntry | undefined };

// Optional at import time so dev and type checks work before the first `pnpm snapshot`.
const snapshots = import.meta.glob<ShopSnapshot>("../../generated/shop-snapshot.json", { eager: true, import: "default" });

function snapshot(): ShopSnapshot {
	const found = Object.values(snapshots)[0];
	if (!found) throw new Error("Missing src/generated/shop-snapshot.json: run `pnpm snapshot --env <environment>` before building.");
	return found;
}

/** Content for getStaticPaths and pages: live with drafts in development, the snapshot otherwise. */
export async function loadShopContent(): Promise<ShopContent> {
	return import.meta.env.DEV ? loadShop(await getDb(), { drafts: true }) : snapshot().shop;
}

export async function loadShopPage(Astro: { url: URL }): Promise<ShopPage> {
	let shop: ShopContent, primary, footer;
	if (import.meta.env.DEV) {
		[shop, primary, footer] = await Promise.all([loadShopContent(), getMenu("primary"), getMenu("footer")]);
	} else {
		({ shop, menus: { primary, footer } } = snapshot());
	}
	const settings = settingsOf(shop);
	const site = { ...siteChrome({ settings, primary, footer, path: Astro.url.pathname }), popups: popupViews(shop.popups, Date.now()) };
	return { shop, settings, site };
}

export const byId = (entries: ShopEntry[], id: string | undefined) => entries.find((entry) => entry.id === id);
