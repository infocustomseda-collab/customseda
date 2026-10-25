import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { foundationAccess } from "./lib/foundation-access";
import { publishedSinceQuery, rebuildConfig, requestRebuild } from "./lib/publish/rebuild";

export { PluginBridge };

const maintenance = createScheduledHandler({ generalCron: "0 * * * *" });

export default {
	...handler,
	async fetch(request, env, ctx) {
		const denied = foundationAccess(request, env);
		if (denied) return denied;
		// The official adapter always exports fetch; its broad handler type marks it optional.
		return handler.fetch!(request, env, ctx);
	},
	async scheduled(controller, env, ctx) {
		await maintenance(controller, env, ctx);
		// Scheduled entries go live in EmDash's sweep, which runs no plugin hooks: rebuild if any did.
		const config = rebuildConfig(env as unknown as Record<string, unknown>);
		if (!config) return;
		const { sql, params } = publishedSinceQuery();
		const since = new Date(controller.scheduledTime - 60 * 60 * 1000).toISOString();
		const row = await env.DB.prepare(sql).bind(...params(since)).first<{ count: number }>();
		if (row?.count) await requestRebuild(config, "scheduled publish").catch((error) => console.error("Rebuild request failed", error));
	},
} satisfies ExportedHandler<Env & { FOUNDATION_ACCESS_TOKEN?: string }>;
