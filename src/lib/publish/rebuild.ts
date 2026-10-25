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

/**
 * Scheduled publishing runs in EmDash's cron without plugin hooks, so the scheduled handler asks
 * whether anything went live since its previous tick. Scalar subqueries, not UNION: D1 limits
 * compound selects to five terms.
 */
export function publishedSinceQuery() {
	const terms = REBUILD_COLLECTIONS.map((collection) => `(SELECT COUNT(*) FROM ec_${collection} WHERE status = 'published' AND deleted_at IS NULL AND published_at >= ?)`);
	return { sql: `SELECT ${terms.join(" + ")} AS count`, params: (since: string) => REBUILD_COLLECTIONS.map(() => since) };
}
