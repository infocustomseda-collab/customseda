import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { foundationAccess } from "./lib/foundation-access";
import { rebuildConfig, requestRebuild, scheduledRebuildReasons } from "./lib/publish/rebuild";

export { PluginBridge };

const maintenance = createScheduledHandler({ generalCron: "0 * * * *" });

export default {
	...handler,
	async fetch(request, env, ctx) {
		const vars = env as unknown as Record<string, unknown>;
		// Staging applies its own gate in the middleware, where the editor session is known.
		const denied = typeof vars.CMS_ORIGIN === 'string' ? null : foundationAccess(request, env);
		if (denied) return denied;
    const url = new URL(request.url);
    // Staging serves storefront previews only; all CMS/auth traffic belongs to production.
    if (typeof vars.CMS_ORIGIN === 'string' && (url.pathname === '/_emdash' || url.pathname.startsWith('/_emdash/')) && !url.pathname.startsWith('/_emdash/api/media/file/')) {
      return new Response(null,{status:307,headers:{Location:new URL(url.pathname+url.search,vars.CMS_ORIGIN).toString(),'Cache-Control':'private, no-store'}});
    }
		// The official adapter always exports fetch; its broad handler type marks it optional.
		return handler.fetch!(request, env, ctx);
	},
	async scheduled(controller, env, ctx) {
		// The public Worker never runs maintenance; an unset role keeps today's single-Worker behavior.
    if ((env as unknown as Record<string, unknown>).CMS_ORIGIN) return;
		// Scheduled publishing and menu edits run no plugin hooks: note them before EmDash's sweep publishes.
		const config = rebuildConfig(env as unknown as Record<string, unknown>);
		const reasons = config ? await scheduledRebuildReasons(env.DB, controller.scheduledTime).catch((error) => (console.error("Rebuild check failed", error), [])) : [];
		await maintenance(controller, env, ctx);
		if (config && reasons.length) await requestRebuild(config, reasons.join(", ")).catch((error) => console.error("Rebuild request failed", error));
	},
} satisfies ExportedHandler<Env & { FOUNDATION_ACCESS_TOKEN?: string }>;
