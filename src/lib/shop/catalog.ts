// Catalog model for listing pages: Products and Conjuntos combined, with derived facets.
// Filtering, sorting and URL state live in filters.ts, which the client script also imports.
import type { ShopContent, ShopEntry } from "./content.ts";
import { productCard } from "./site.ts";
import { orderSizes, SIZE_ORDER } from "./view.ts";
import type { CatalogItem } from "./filters.ts";

export * from "./filters.ts";

type Lookups = Pick<ShopContent, "categories" | "collections" | "colors" | "sizes" | "products" | "conjuntos">;

const code = (entries: ShopEntry[], id: string | undefined) => {
	const value = entries.find((entry) => entry.id === id)?.data.code;
	return typeof value === "string" ? value : null;
};

export function buildCatalog(shop: Lookups): CatalogItem[] {
	const pieces = shop.products.map((entry) => {
		const category = code(shop.categories, entry.refs.category?.[0]);
		return {
			entry,
			category: category === "braguita" ? ("braguita" as const) : ("top" as const),
			color: code(shop.colors, entry.refs.color?.[0]),
			collection: code(shop.collections, entry.refs.collection?.[0]),
			sizes: orderSizes((entry.refs.sizes ?? []).flatMap((id) => code(shop.sizes, id) ?? [])),
			available: entry.data.available !== false,
		};
	});
	const pieceItem = (piece: (typeof pieces)[number]): CatalogItem => ({
		id: piece.entry.id,
		slug: piece.entry.slug,
		kind: "pieza",
		category: piece.category,
		title: String(piece.entry.data.title ?? ""),
		price: Number(piece.entry.data.price_cents ?? 0),
		available: piece.available,
		color: piece.color,
		collection: piece.collection,
		sizes: piece.sizes,
		card: productCard(piece.entry),
	});
	// A Conjunto needs both components; it inherits their color and collection and is available only
	// when it and both components are.
	const sets = shop.conjuntos.flatMap((entry): CatalogItem[] => {
		const top = pieces.find((piece) => piece.entry.id === entry.refs.top?.[0]);
		const bottom = pieces.find((piece) => piece.entry.id === entry.refs.bottom?.[0]);
		if (!top || !bottom) return [];
		const card = productCard(entry);
		const available = entry.data.available !== false && top.available && bottom.available;
		return [{
			id: entry.id,
			slug: entry.slug,
			kind: "conjunto",
			category: "conjunto",
			title: String(entry.data.title ?? ""),
			price: Number(entry.data.price_cents ?? 0),
			available,
			color: top.color,
			collection: top.collection,
			// Each piece's size is chosen separately, so the set matches any size either piece offers.
			sizes: orderSizes([...top.sizes, ...bottom.sizes]),
			card: { ...card, available },
		}];
	});
	return [...sets, ...pieces.filter((p) => p.category === "top").map(pieceItem), ...pieces.filter((p) => p.category === "braguita").map(pieceItem)];
}

export type CatalogView = { handle: string; title: string; description?: unknown; items: (all: CatalogItem[]) => CatalogItem[] };

export function catalogViews(shop: Pick<ShopContent, "collections">): CatalogView[] {
	return [
		{ handle: "bikinis", title: "Bikinis", items: (all) => all },
		{ handle: "conjuntos", title: "Conjuntos", items: (all) => all.filter((item) => item.kind === "conjunto") },
		{ handle: "top", title: "Tops", items: (all) => all.filter((item) => item.category === "top") },
		{ handle: "braguitas", title: "Braguitas", items: (all) => all.filter((item) => item.category === "braguita") },
		...shop.collections.flatMap((entry): CatalogView[] => {
			const handle = entry.data.code;
			if (typeof handle !== "string" || !handle) return [];
			return [{ handle, title: String(entry.data.title ?? handle), description: entry.data.description, items: (all) => all.filter((item) => item.collection === handle) }];
		}),
	];
}

export const catalogView = (handle: string, shop: Pick<ShopContent, "collections">) =>
	catalogViews(shop).find((view) => view.handle === handle) ?? null;

export function facetOptions(items: CatalogItem[], shop: Pick<ShopContent, "colors">) {
	const colors = new Set(items.map((item) => item.color));
	const sizes = new Set(items.flatMap((item) => item.sizes));
	return {
		colors: shop.colors.flatMap((entry) => {
			const value = entry.data.code;
			return typeof value === "string" && colors.has(value) ? [{ code: value, label: String(entry.data.title ?? value) }] : [];
		}),
		sizes: SIZE_ORDER.filter((size) => sizes.has(size)),
	};
}

/** The homepage's featured Conjunto, only when the catalog can show it (both components present). */
export function featuredItem(shop: Lookups, id: string | undefined): CatalogItem | null {
	return buildCatalog(shop).find((item) => item.kind === "conjunto" && item.id === id) ?? null;
}
