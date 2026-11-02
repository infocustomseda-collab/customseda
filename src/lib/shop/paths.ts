// getStaticPaths for the prerendered public routes, using the same resolution rules as the pages.
import { catalogViews } from "./catalog.ts";
import type { ShopContent } from "./content.ts";
import { productDetail } from "./detail.ts";
import type { SiteMode } from "../site-mode.ts";

type Paths<P extends string, Props = undefined> = { params: Record<P, string>; props?: Props }[];
// Pages with a dedicated route under /pages/ (contact.astro, margarita.astro, seda.astro).
const DEDICATED_PAGES = new Set(["contact", "margarita", "seda"]);

export function productPaths(shop: ShopContent): Paths<"slug"> {
	return shop.products.flatMap((entry) => (productDetail(shop, entry.slug) ? [{ params: { slug: entry.slug } }] : []));
}

export const collectionPaths = (shop: ShopContent): Paths<"handle"> => catalogViews(shop).map((view) => ({ params: { handle: view.handle } }));

export const pagePaths = (shop: ShopContent): Paths<"slug"> =>
	shop.pages.filter((page) => !DEDICATED_PAGES.has(page.slug)).map((page) => ({ params: { slug: page.slug } }));

export const policyPaths = (shop: ShopContent): Paths<"slug"> =>
	shop.pages.filter((page) => page.slug.endsWith("-policy")).map((page) => ({ params: { slug: page.slug } }));

/** Public path of a CMS page: policies under /policies/, everything else under /pages/. */
export const publicPagePath = (slug: string): string => (slug.endsWith("-policy") ? `/policies/${slug}` : `/pages/${slug}`);

/** The CMS still links pages at /<slug>; each redirects to its public path. */
export const rootRedirectPaths = (shop: ShopContent): Paths<"slug", { target: string }> =>
	shop.pages.map((page) => ({ params: { slug: page.slug }, props: { target: publicPagePath(page.slug) } }));

/** The same root redirects as an Astro `redirects` map, which the Cloudflare adapter writes to `_redirects` as real 301s. */
export const rootRedirects = (shop: ShopContent): Record<string, string> =>
	Object.fromEntries(rootRedirectPaths(shop).map((path) => [`/${path.params.slug}`, path.props!.target]));

/** Redirect target for one root slug, for preview mode where there are no static props. */
export const rootRedirectTarget = (shop: ShopContent, slug: string): string | null =>
	rootRedirectPaths(shop).find((path) => path.params.slug === slug)?.props?.target ?? null;

/**
 * Root `/<slug>` redirect. Preview (and dev) render on request and must keep the query (`?_preview=<token>`),
 * so it is temporary; the prerendered public build has no query and redirects permanently.
 */
export const rootRedirect = (target: string, search: string, mode: SiteMode): { location: string; status: 301 | 302 } =>
	mode === "public" ? { location: target, status: 301 } : { location: target + search, status: 302 };
