import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { foundationAccess } from "./lib/foundation-access";
import { rebuildConfig, requestRebuild, scheduledRebuildReasons } from "./lib/publish/rebuild";

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
		// Scheduled publishing and menu edits run no plugin hooks: note them before EmDash's sweep publishes.
		const config = rebuildConfig(env as unknown as Record<string, unknown>);
		const reasons = config ? await scheduledRebuildReasons(env.DB, controller.scheduledTime).catch((error) => (console.error("Rebuild check failed", error), [])) : [];
		await maintenance(controller, env, ctx);
		if (config && reasons.length) await requestRebuild(config, reasons.join(", ")).catch((error) => console.error("Rebuild request failed", error));
	},
} satisfies ExportedHandler<Env & { FOUNDATION_ACCESS_TOKEN?: string }>;
