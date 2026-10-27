// getStaticPaths for the prerendered public routes, using the same resolution rules as the pages.
import { catalogViews } from "./catalog.ts";
import type { ShopContent } from "./content.ts";
import { productDetail } from "./detail.ts";

type Paths<P extends string, Props = undefined> = { params: Record<P, string>; props?: Props }[];
// Pages with a dedicated route under /pages/ (contact.astro, margarita.astro).
const DEDICATED_PAGES = new Set(["contact", "margarita"]);

export function productPaths(shop: ShopContent): Paths<"slug"> {
	return shop.products.flatMap((entry) => (productDetail(shop, entry.slug) ? [{ params: { slug: entry.slug } }] : []));
}

export const collectionPaths = (shop: ShopContent): Paths<"handle"> => catalogViews(shop).map((view) => ({ params: { handle: view.handle } }));

export const pagePaths = (shop: ShopContent): Paths<"slug"> =>
	shop.pages.filter((page) => !DEDICATED_PAGES.has(page.slug)).map((page) => ({ params: { slug: page.slug } }));

export const policyPaths = (shop: ShopContent): Paths<"slug"> =>
	shop.pages.filter((page) => page.slug.endsWith("-policy")).map((page) => ({ params: { slug: page.slug } }));

/** The CMS still links pages at /<slug>; each redirects to its public path. */
export const rootRedirectPaths = (shop: ShopContent): Paths<"slug", { target: string }> =>
	shop.pages.map((page) => ({
		params: { slug: page.slug },
		props: { target: page.slug === "noticias" ? "/blogs/noticias" : page.slug.endsWith("-policy") ? `/policies/${page.slug}` : `/pages/${page.slug}` },
	}));
