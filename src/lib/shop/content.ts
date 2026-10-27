// Read layer for the public shop. Production reads published rows only, exactly as stored.
// Development preview also shows drafts with their pending revision and staged references,
// because the imported catalog is still unpublished. Phase 6 replaces the live read with a
// build-time snapshot of the same shape.
import { ContentRepository, RevisionRepository, type Database } from "emdash";
import type { Kysely } from "kysely";

/** Shop collections and their parent-side reference fields → target collection. */
export const shopTypes = {
	products: { collection: "collections", material: "materials", size_guide: "size_guides", components: "products" },
	collections: {},
	colors: {},
	materials: { color: "colors", sizes: "sizes" },
	sizes: {},
	size_guides: {},
	site_settings: { featured_conjunto: "products" },
	pages: {},
	popups: {},
	shipping_rules: {},
} as const satisfies Record<string, Record<string, string>>;

export type ShopType = keyof typeof shopTypes;
export type ShopEntry = {
	id: string;
	slug: string;
	status: string;
	data: Record<string, unknown>;
	/** Referenced entry IDs per reference field, in display order. */
	refs: Record<string, string[]>;
};
export type ShopContent = Record<ShopType, ShopEntry[]> & { categories: ShopEntry[] };

const BOOLEAN_FIELDS = ["bundle", "enabled", "announcement_enabled"];

type Loaded = ShopEntry & { type: ShopType; group: string; staged?: Record<string, unknown> };

async function items(repo: ContentRepository, type: ShopType, drafts: boolean) {
	const rows = [];
	for (let cursor: string | undefined; ; ) {
		const page = await repo.findMany(type, { where: drafts ? {} : { status: "published" }, limit: 100, cursor });
		rows.push(...page.items);
		if (!page.nextCursor) return rows;
		cursor = page.nextCursor;
	}
}

/** `only` limits the read to some types; references into types left out resolve to nothing. */
export async function loadShop(db: Kysely<Database>, { drafts, only }: { drafts: boolean; only?: ShopType[] }): Promise<ShopContent> {
	const repo = new ContentRepository(db);
	const revisions = new RevisionRepository(db);
	const loaded: Loaded[] = [];
	for (const type of only ?? (Object.keys(shopTypes) as ShopType[])) {
		for (const item of await items(repo, type, drafts)) {
			let data = { ...item.data };
			let staged: Record<string, unknown> | undefined;
			if (drafts && item.draftRevisionId) {
				const revision = await revisions.findById(item.draftRevisionId);
				if (revision) {
					data = { ...data, ...Object.fromEntries(Object.entries(revision.data).filter(([key]) => !key.startsWith("_"))) };
					staged = revision.data._references as Record<string, unknown> | undefined;
				}
			}
			// SQLite stores booleans as 0/1 on the row; revisions keep JSON booleans.
			for (const field of BOOLEAN_FIELDS) if (data[field] === 0 || data[field] === 1) data[field] = Boolean(data[field]);
			const group = item.translationGroup ?? item.id;
			loaded.push({ id: item.id, slug: item.slug ?? item.id, status: item.status, data, refs: {}, type, group, staged });
		}
	}

	// Live reference links, keyed by relation slug (`<collection>_<field>`) and parent translation group.
	const links = await db
		.selectFrom("_emdash_content_references as e")
		.innerJoin("_emdash_relations as rel", "rel.id", "e.relation_id")
		.select(["rel.slug as relation", "e.parent_group as parent", "e.child_group as child"])
		.orderBy("e.sort_order")
		.execute();
	const live = new Map<string, string[]>();
	for (const link of links) {
		const key = `${link.relation}:${link.parent}`;
		live.set(key, [...(live.get(key) ?? []), link.child]);
	}

	const byGroup = new Map(loaded.map((entry) => [`${entry.type}:${entry.group}`, entry.id]));
	const content = Object.fromEntries(Object.keys(shopTypes).map((type) => [type, []])) as unknown as ShopContent;
	for (const { type, group, staged, ...entry } of loaded) {
		for (const [field, target] of Object.entries(shopTypes[type] as Record<string, ShopType>)) {
			const pending = staged?.[field];
			const groups = Array.isArray(pending) ? (pending as string[]) : (live.get(`${type}_${field}:${group}`) ?? []);
			// Unresolved groups point at entries this mode cannot show (e.g. drafts in production).
			entry.refs[field] = groups.flatMap((child) => byGroup.get(`${target}:${child}`) ?? []);
		}
		content[type].push(entry);
	}
	// Native terms remain taxonomy data; this normalizes them for the static snapshot.
	const terms = await db.selectFrom('taxonomies').selectAll().where('name','=','category').orderBy('sort_order').orderBy('locale','desc').execute();
	content.categories = [...new Map(terms.map(term => [term.translation_group ?? term.id, {
		id: term.translation_group ?? term.id, slug: term.slug, status: 'published',
		data: { title: term.label, code: term.slug, parent: term.parent_id }, refs: {},
	}])).values()];
	// Sizes carry their category so product pages offer only the sizes of the product's category.
	const assignments = await db.selectFrom('content_taxonomies').select(['collection','entry_id','taxonomy_id']).where('collection','in',['products','sizes']).execute();
	const categories = new Set(content.categories.map(term => term.id));
	for (const type of ['products', 'sizes'] as const) for (const item of content[type]) {
		const group = loaded.find(entry => entry.type === type && entry.id === item.id)!.group;
		item.refs.category = [...new Set(assignments.filter(link => link.collection === type && link.entry_id === group && categories.has(link.taxonomy_id)).map(link => link.taxonomy_id))];
	}
	return content;
}
