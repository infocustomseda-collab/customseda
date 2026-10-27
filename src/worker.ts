import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { foundationAccess } from "./lib/foundation-access";
import { publicAdminRedirect } from "./lib/public-routing";
import { rebuildConfig, requestRebuild, scheduledRebuildReasons } from "./lib/publish/rebuild";

export { PluginBridge };

const maintenance = createScheduledHandler({ generalCron: "0 * * * *" });

export default {
	...handler,
	async fetch(request, env, ctx) {
		const denied = foundationAccess(request, env);
		if (denied) return denied;
		const vars = env as unknown as Record<string, unknown>;
		const target = publicAdminRedirect(new URL(request.url), vars.SITE_ROLE as string | undefined, vars.PREVIEW_SITE_URL as string | undefined);
		if (target) return Response.redirect(target, 302);
		// The official adapter always exports fetch; its broad handler type marks it optional.
		return handler.fetch!(request, env, ctx);
	},
	async scheduled(controller, env, ctx) {
		// The public Worker never runs maintenance; an unset role keeps today's single-Worker behavior.
		if ((env as unknown as Record<string, unknown>).SITE_ROLE === "public") return;
		// Scheduled publishing and menu edits run no plugin hooks: note them before EmDash's sweep publishes.
		const config = rebuildConfig(env as unknown as Record<string, unknown>);
		const reasons = config ? await scheduledRebuildReasons(env.DB, controller.scheduledTime).catch((error) => (console.error("Rebuild check failed", error), [])) : [];
		await maintenance(controller, env, ctx);
		if (config && reasons.length) await requestRebuild(config, reasons.join(", ")).catch((error) => console.error("Rebuild request failed", error));
	},
} satisfies ExportedHandler<Env & { FOUNDATION_ACCESS_TOKEN?: string }>;
