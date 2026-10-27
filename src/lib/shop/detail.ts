// Product and Conjunto detail pages: resolve one slug against the catalog with labels and related items.
import { buildCatalog, type CatalogItem } from "./catalog.ts";
import type { ShopContent, ShopEntry } from "./content.ts";

type Piece = { entry: ShopEntry; item: CatalogItem };
type Common = {
	entry: ShopEntry;
	item: CatalogItem;
	colorLabel: string | null;
	collectionLabel: string | null;
	sizeGuide: ShopEntry | undefined;
	related: CatalogItem[];
	/** Available and every required size choice has options; otherwise the buy form stays disabled. */
	purchasable: boolean;
};
export type ProductDetail = Common & { kind: "pieza" | "bundle"; categoryLabel: string | null; components: Piece[] };

const label = (entries: ShopEntry[], key: string | null, field = "code") => {
	const found = entries.find((entry) => entry.data[field] === key);
	return typeof found?.data.title === "string" ? found.data.title : null;
};

function related(items: CatalogItem[], item: CatalogItem, limit = 4) {
	const others = items.filter((other) => other.id !== item.id);
	return [...others.filter((other) => other.color === item.color), ...others.filter((other) => other.color !== item.color)].slice(0, limit);
}

export function productDetail(shop: Omit<ShopContent, "pages" | "site_settings" | "popups"> & Partial<ShopContent>, slug: string): ProductDetail | null {
	const items = buildCatalog(shop);
	const item = items.find((candidate) => candidate.slug === slug);
	if (!item) return null;
	const piece = (id: string | undefined): Piece | null => {
		const entry = shop.products.find((product) => product.id === id);
		const pieceItem = items.find((candidate) => candidate.id === id);
		return entry && pieceItem ? { entry, item: pieceItem } : null;
	};
	const guideFor = (entry: ShopEntry) => shop.size_guides.find((guide) => guide.id === entry.refs.size_guide?.[0]) ?? shop.size_guides[0];
	const common = {
		item,
		colorLabel: label(shop.colors, item.color),
		collectionLabel: label(shop.collections, item.collection),
		related: related(items, item),
	};
	const entry = shop.products.find(product=>product.id===item.id)!;
	const components=item.kind==='bundle'?(entry.refs.components??[]).flatMap(id=>piece(id)??[]):[];
	const category=shop.categories.find(candidate=>candidate.id===entry.refs.category?.[0]);
	return {...common,kind:item.kind,entry,components,
		categoryLabel:typeof category?.data.title==='string'?category.data.title:null,
		sizeGuide:guideFor(entry)??(components[0]?guideFor(components[0].entry):undefined),
		purchasable:item.available&&(item.kind==='bundle'?components.length>=2&&components.every(component=>component.item.sizes.length>0):item.sizes.length>0),
	};
}
