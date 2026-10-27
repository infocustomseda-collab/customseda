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
	card: ProductCardView;
};

export const SORTS = ["destacados", "precio-asc", "precio-desc", "nombre"] as const;
export type Sort = (typeof SORTS)[number];
export type Category = string;
export type Filters = { category?: Category; colors: string[]; available: boolean; sort?: Sort };

export function filterItems(items: CatalogItem[], filters: Filters): CatalogItem[] {
	return items.filter(
		(item) =>
			(!filters.category || item.categories.includes(filters.category)) &&
			(filters.colors.length === 0 || (item.color !== null && filters.colors.includes(item.color))) &&
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

export function parseFilters(search: string, allowed: { colors: string[]; categories?: string[]; defaultCategory?: Category }): Required<Filters> {
	const params = new URLSearchParams(search);
	const sort = params.get("orden");
	const category = params.get("category");
	return {
		category: category && allowed.categories?.includes(category) ? category : category === null ? allowed.defaultCategory ?? "" : "",
		colors: [...new Set(params.getAll("color"))].filter((value) => allowed.colors.includes(value)),
		available: params.get("disponible") === "1",
		sort: SORTS.includes(sort as Sort) ? (sort as Sort) : "destacados",
	};
}

export function filtersQuery(filters: Filters): string {
	const params = new URLSearchParams();
	if (filters.category) params.set("category", filters.category);
	for (const color of filters.colors) params.append("color", color);
	if (filters.available) params.set("disponible", "1");
	if (filters.sort && filters.sort !== "destacados") params.set("orden", filters.sort);
	const query = params.toString();
	return query ? `?${query}` : "";
}

/** Category choices refine the same grid and keep its other selections. */
export function categoryHref(path: string, filters: Filters, category: Category): string {
	return path + filtersQuery({ ...filters, category });
}
