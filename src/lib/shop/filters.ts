// Pure catalog filtering, sorting and URL state, shared by the server render and the browser script.
// Keep this module free of server imports so it bundles cleanly for the client.
import type { ProductCardView, SizeCode } from "./view.ts";

export type CatalogItem = {
	id: string;
	slug: string;
	kind: "bundle" | "pieza";
	category: string | null;
	categories: string[];
	title: string;
	price: number;
	available: boolean;
	color: string | null;
	collection: string | null;
	sizes: SizeCode[];
	/** Sizes by category slug: a piece has its own category; a Conjunto has one entry per piece. */
	sizesByCategory: Record<string, SizeCode[]>;
	card: ProductCardView;
};

export const SORTS = ["destacados", "precio-asc", "precio-desc", "nombre"] as const;
export type Sort = (typeof SORTS)[number];
export type Category = string;
/** `sizes` holds talla values shaped like native talla slugs: `<category>-<label>`, e.g. `top-m`. */
export type Filters = { category?: Category; colors: string[]; sizes?: string[]; available: boolean; sort?: Sort };

export const sizeValue = (category: string, label: string) => `${category}-${label.toLowerCase()}`;

// Selected sizes grouped by category. A value without a category (an old label-only bookmark) is ignored.
function sizesWanted(values: string[] = []): Map<string, string[]> {
	const wanted = new Map<string, string[]>();
	for (const value of values) {
		const split = value.lastIndexOf("-");
		if (split <= 0) continue;
		const category = value.slice(0, split);
		wanted.set(category, [...(wanted.get(category) ?? []), value.slice(split + 1).toUpperCase()]);
	}
	return wanted;
}

// Every selected size of a category must be offered by the item's piece in that category. A piece
// has only its own category, so sizes from two categories leave only Conjuntos.
function offersSizes(item: CatalogItem, wanted: Map<string, string[]>): boolean {
	return [...wanted].every(([category, labels]) => {
		const offered: readonly string[] | undefined = item.sizesByCategory[category];
		return offered !== undefined && labels.every((label) => offered.includes(label));
	});
}

export function filterItems(items: CatalogItem[], filters: Filters): CatalogItem[] {
	const wanted = sizesWanted(filters.sizes);
	return items.filter(
		(item) =>
			(!filters.category || item.categories.includes(filters.category)) &&
			(filters.colors.length === 0 || (item.color !== null && filters.colors.includes(item.color))) &&
			offersSizes(item, wanted) &&
			(!filters.available || item.available),
	);
}

export function sortItems(items: CatalogItem[], sort: Sort | undefined): CatalogItem[] {
	const sorted = [...items];
	if (sort === "precio-asc") sorted.sort((a, b) => a.price - b.price);
	else if (sort === "precio-desc") sorted.sort((a, b) => b.price - a.price);
	else if (sort === "nombre") sorted.sort((a, b) => a.title.localeCompare(b.title, "es"));
	return sorted;
}

export function parseFilters(search: string, allowed: { colors: string[]; sizes?: string[]; categories?: string[]; defaultCategory?: Category }): Required<Filters> {
	const params = new URLSearchParams(search);
	const sort = params.get("orden");
	const category = params.get("category");
	return {
		category: category && allowed.categories?.includes(category) ? category : category === null ? allowed.defaultCategory ?? "" : "",
		colors: [...new Set(params.getAll("color"))].filter((value) => allowed.colors.includes(value)),
		sizes: [...new Set(params.getAll("talla"))].filter((value) => allowed.sizes?.includes(value)),
		available: params.get("disponible") === "1",
		sort: SORTS.includes(sort as Sort) ? (sort as Sort) : "destacados",
	};
}

export function filtersQuery(filters: Filters): string {
	const params = new URLSearchParams();
	if (filters.category) params.set("category", filters.category);
	for (const color of filters.colors) params.append("color", color);
	for (const size of filters.sizes ?? []) params.append("talla", size);
	if (filters.available) params.set("disponible", "1");
	if (filters.sort && filters.sort !== "destacados") params.set("orden", filters.sort);
	const query = params.toString();
	return query ? `?${query}` : "";
}

/** Category choices refine the same grid and keep its other selections. */
export function categoryHref(path: string, filters: Filters, category: Category): string {
	return path + filtersQuery({ ...filters, category });
}
