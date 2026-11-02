// Files for search engines and AI crawlers, built from the same content as the pages: the sitemap lists
// public paths (not the CMS `/<slug>` links), llms.txt summarizes the shop, and product pages carry schema.org data.
import { buildCatalog, catalogView, catalogViews, type CatalogView } from "./catalog.ts";
import type { ShopContent } from "./content.ts";
import type { ProductDetail } from "./detail.ts";
import { productPaths, publicPagePath } from "./paths.ts";
import { plainText, settingsOf } from "./site.ts";
import { formatPrice } from "./view.ts";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
export const siteName = (shop: Pick<ShopContent, "site_settings">) => text(settingsOf(shop)?.data.title) || "Seda";

/** Public path of a rendered page: prerendered pages see their output file (`/products/x.html`, `/index.html`). */
export const publicPath = (pathname: string) => pathname.replace(/(\/index)?\.html$/, "") || "/";

// Some handles show the same listing (bikinis = mujeres, braguita = braguitas); keep the existing public URL.
const PREFERRED_HANDLES = new Set(["bikinis", "braguitas"]);
const listingKey = (view: CatalogView) => view.scope ?? view.handle;

/** One listing per scope, under its preferred handle. */
function canonicalCollections(shop: Pick<ShopContent, "categories">): CatalogView[] {
	const byScope = new Map<string, CatalogView>();
	for (const view of catalogViews(shop)) if (!byScope.has(listingKey(view)) || PREFERRED_HANDLES.has(view.handle)) byScope.set(listingKey(view), view);
	return [...byScope.values()];
}

/** Canonical path of a catalog listing, e.g. /collections/mujeres → /collections/bikinis. */
export function collectionCanonicalPath(shop: Pick<ShopContent, "categories">, handle: string): string {
	const view = catalogView(handle, shop);
	const canonical = view && canonicalCollections(shop).find((other) => listingKey(other) === listingKey(view));
	return `/collections/${canonical?.handle ?? handle}`;
}

/** Every indexable public path: home, catalog listings, products and CMS pages. */
export function sitemapPaths(shop: ShopContent): string[] {
	return [
		"/",
		...canonicalCollections(shop).map((view) => `/collections/${view.handle}`),
		...productPaths(shop).map(({ params }) => `/products/${params.slug}`),
		...shop.pages.map((page) => publicPagePath(page.slug)),
	];
}

const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sitemapXml(paths: string[], site: URL): string {
	const urls = paths.map((path) => `  <url><loc>${xml(new URL(path, site).href)}</loc></url>`);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// Markdown link text and descriptions stay on one line and cannot close the link.
const line = (value: string) => value.replace(/\s+/g, " ").replace(/[[\]]/g, "").trim();

/** llms.txt (https://llmstxt.org): name, summary, then link lists with CMS text only. */
export function llmsText(shop: ShopContent, site: URL): string {
	const settings = settingsOf(shop)?.data ?? {};
	const href = (path: string) => new URL(path, site).href;
	const catalog = new Map(buildCatalog(shop).map((item) => [item.slug, item]));
	// Same summary as the home page description: the plain hero text, else the intro.
	const summary = line(text(settings.hero_text) || plainText(settings.intro_text, 300));
	const products = productPaths(shop).flatMap(({ params }) => {
		const item = catalog.get(params.slug);
		const entry = shop.products.find((product) => product.slug === params.slug);
		if (!item || !entry) return [];
		const description = line(plainText(entry.data.description, 200));
		return [`- [${line(item.title)}](${href(`/products/${item.slug}`)}): ${formatPrice(item.price)}${description ? `. ${description}` : ""}`];
	});
	const sections = [
		["Colecciones", canonicalCollections(shop).map((view) => `- [${line(view.title)}](${href(`/collections/${view.handle}`)})`)],
		["Productos", products],
		["Información", shop.pages.map((page) => `- [${line(text(page.data.title) || page.slug)}](${href(publicPagePath(page.slug))})`)],
	] as const;
	const email = text(settings.contact_email);
	return [
		`# ${line(siteName(shop))}`,
		...(summary ? [`> ${summary}`] : []),
		...(email ? [`Contacto: ${email}`] : []),
		...sections.filter(([, links]) => links.length).map(([title, links]) => `## ${title}\n\n${links.join("\n")}`),
	].join("\n\n") + "\n";
}

/** schema.org Product with one EUR offer. Pieces are made to order, so an available product is MadeToOrder. */
export function productStructuredData(detail: ProductDetail, { url, images, description, brand }: { url: string; images: string[]; description: string; brand: string }) {
	const { item } = detail;
	return {
		"@context": "https://schema.org",
		"@type": "Product",
		name: item.title,
		...(description ? { description } : {}),
		...(images.length ? { image: images } : {}),
		...(detail.colorLabel ? { color: detail.colorLabel } : {}),
		url,
		brand: { "@type": "Brand", name: brand },
		offers: {
			"@type": "Offer",
			url,
			price: (item.price / 100).toFixed(2),
			priceCurrency: "EUR",
			itemCondition: "https://schema.org/NewCondition",
			availability: item.available ? "https://schema.org/MadeToOrder" : "https://schema.org/OutOfStock",
		},
	};
}
