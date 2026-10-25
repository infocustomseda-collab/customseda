// Publish-triggered rebuilds: a CMS change dispatches the deploy workflow for this environment only.
// GitHub's per-environment concurrency queue coalesces bursts; a failed build leaves the old site up.
export const REBUILD_COLLECTIONS = ["products", "conjuntos", "categories", "collections", "colors", "sizes", "size_guides", "site_settings", "pages", "popups", "shipping_rules"];

export type RebuildConfig = { token: string; repository: string; environment: "staging" | "production" };

/** Null (no rebuild) unless a token, repository and remote environment are all configured. */
export function rebuildConfig(env: Record<string, unknown>): RebuildConfig | null {
	const { GITHUB_REBUILD_TOKEN: token, GITHUB_REPOSITORY: repository, DEPLOY_ENVIRONMENT: environment } = env;
	if (typeof token !== "string" || !token || typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return null;
	if (environment !== "staging" && environment !== "production") return null;
	return { token, repository, environment };
}

export async function requestRebuild(config: RebuildConfig, reason: string, fetchImpl: typeof fetch = fetch) {
	const response = await fetchImpl(`https://api.github.com/repos/${config.repository}/actions/workflows/deploy.yml/dispatches`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.token}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "customseda-rebuild",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ ref: "master", inputs: { environment: config.environment, reason: reason.slice(0, 200) } }),
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as { message?: string };
		throw new Error(`GitHub ${response.status}: ${body.message ?? "workflow dispatch failed"}`);
	}
}

/** Same checks as the other admin-only customseda routes. */
export const rebuildRequestAllowed = ({ role, origin, requestOrigin, csrf }: { role: number; origin: string; requestOrigin: string | null; csrf: string | null }) =>
	role >= 50 && requestOrigin === origin && csrf === "1";

type D1Like = { prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> } } };
const MENU_FINGERPRINT = "customseda.rebuild.menu-fingerprint";

/**
 * Changes that no plugin hook reports, checked by the hourly scheduled handler before EmDash's sweep:
 * scheduled entries now due (also scheduled edits of live entries, which keep their published_at),
 * and menu edits (menu items have no updated_at, so a fingerprint is kept in options).
 * Scalar subqueries, not UNION: D1 limits compound selects to five terms.
 */
export async function scheduledRebuildReasons(db: D1Like, now: number): Promise<string[]> {
	const reasons: string[] = [];
	const due = REBUILD_COLLECTIONS.map((collection) => `(SELECT COUNT(*) FROM ec_${collection} WHERE scheduled_at IS NOT NULL AND scheduled_at <= ? AND deleted_at IS NULL)`);
	const iso = new Date(now).toISOString();
	const row = await db.prepare(`SELECT ${due.join(" + ")} AS count`).bind(...REBUILD_COLLECTIONS.map(() => iso)).first<{ count: number }>();
	if (Number(row?.count) > 0) reasons.push("scheduled publish");

	const { results } = await db.prepare(`SELECT m.name, m.label, m.locale, i.id, i.parent_id, i.sort_order, i.type, i.reference_collection, i.reference_id, i.custom_url, i.label AS item_label, i.target
		FROM _emdash_menus m LEFT JOIN _emdash_menu_items i ON i.menu_id = m.id ORDER BY m.name, m.id, i.sort_order, i.id`).bind().all();
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(results)));
	const fingerprint = JSON.stringify([...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
	const stored = await db.prepare("SELECT value FROM options WHERE name = ?").bind(MENU_FINGERPRINT).first<{ value: string }>();
	if (stored?.value !== fingerprint) {
		await db.prepare("INSERT INTO options (name, value, revision) VALUES (?, ?, 1) ON CONFLICT(name) DO UPDATE SET value = excluded.value, revision = options.revision + 1").bind(MENU_FINGERPRINT, fingerprint).run();
		// The first run only records the fingerprint.
		if (stored) reasons.push("menu change");
	}
	return reasons;
}
