// Build-time snapshot of one environment's published content. Deployed public pages prerender from
// it, so they never read D1 per request. Written by `pnpm snapshot`; never committed.
import type { Database, Menu, MenuItem } from "emdash";
import { sql, type Kysely } from "kysely";
import { loadShop, type ShopContent } from "./content.ts";

export const SNAPSHOT_PATH = "src/generated/shop-snapshot.json";
export type SnapshotEnvironment = "local" | "staging" | "production";
export type ShopSnapshot = {
	version: 1;
	environment: SnapshotEnvironment;
	generatedAt: string;
	shop: ShopContent;
	menus: { primary: Menu; footer: Menu };
};

// Public paths of referenced content; the CMS url_pattern values predate the retained Shopify paths.
const PUBLIC_PATHS: Record<string, string> = { products: "/products/", conjuntos: "/products/", pages: "/pages/", collections: "/collections/" };

type ItemRow = { id: string; sort_order: number; type: string; custom_url: string | null; reference_collection: string | null; reference_id: string | null; label: string; title_attr: string | null; target: string | null; css_classes: string | null };

async function readMenu(db: Kysely<Database>, name: string): Promise<Menu> {
	const menu = (await sql<{ id: string; label: string; locale: string; translation_group: string | null }>`
		SELECT id, label, locale, translation_group FROM _emdash_menus WHERE name = ${name} ORDER BY locale, id LIMIT 1`.execute(db)).rows[0];
	if (!menu) return { id: "", name, label: name, items: [], locale: "es", translationGroup: null };
	const rows = (await sql<ItemRow>`
		SELECT id, sort_order, type, custom_url, reference_collection, reference_id, label, title_attr, target, css_classes
		FROM _emdash_menu_items WHERE menu_id = ${menu.id} AND parent_id IS NULL ORDER BY sort_order, id`.execute(db)).rows;
	const items: MenuItem[] = [];
	for (const row of rows) {
		let url = row.type === "custom" ? row.custom_url : null;
		const base = row.reference_collection ? PUBLIC_PATHS[row.reference_collection] : undefined;
		if (row.type !== "custom" && base && row.reference_id && /^[a-z_]+$/.test(row.reference_collection!)) {
			// References hold a translation group; only a published entry gets a link.
			const target = (await sql<{ slug: string | null }>`
				SELECT slug FROM ${sql.table(`ec_${row.reference_collection}`)}
				WHERE (translation_group = ${row.reference_id} OR id = ${row.reference_id}) AND status = 'published' AND deleted_at IS NULL LIMIT 1`.execute(db)).rows[0];
			url = target?.slug ? `${base}${target.slug}` : null;
		}
		if (!url) continue;
		items.push({ id: row.id, label: row.label, url, target: row.target ?? undefined, titleAttr: row.title_attr ?? undefined, cssClasses: row.css_classes ?? undefined, children: [] });
	}
	return { id: menu.id, name, label: menu.label, items, locale: menu.locale, translationGroup: menu.translation_group };
}

/** `drafts` previews unpublished local content in a local build; remote snapshots are always published-only. */
export async function createSnapshot(db: Kysely<Database>, environment: SnapshotEnvironment, { drafts = false } = {}): Promise<ShopSnapshot> {
	if (drafts && environment !== "local") throw new Error("Draft snapshots are local only.");
	const [shop, primary, footer] = [await loadShop(db, { drafts }), await readMenu(db, "primary"), await readMenu(db, "footer")];
	return { version: 1, environment, generatedAt: new Date().toISOString(), shop, menus: { primary, footer } };
}

/** Refuses a snapshot from another environment, or an empty catalog unless explicitly allowed. */
export function assertPublishable(snapshot: ShopSnapshot, { environment, allowEmpty }: { environment: string; allowEmpty: boolean }) {
	if (snapshot.environment !== environment) throw new Error(`Snapshot is from ${snapshot.environment}, not ${environment}; refusing to build.`);
	if (!allowEmpty && !snapshot.shop.products.length && !snapshot.shop.conjuntos.length) {
		throw new Error(`The ${environment} snapshot has no published products or Conjuntos; pass --allow-empty only for a first deploy.`);
	}
}
