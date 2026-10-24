import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { foundationAccess } from "./lib/foundation-access";

export { PluginBridge };

export default {
	...handler,
	async fetch(request, env, ctx) {
		const denied = foundationAccess(request, env);
		if (denied) return denied;
		// The official adapter always exports fetch; its broad handler type marks it optional.
		return handler.fetch!(request, env, ctx);
	},
	scheduled: createScheduledHandler({ generalCron: "0 * * * *" }),
} satisfies ExportedHandler<Env & { FOUNDATION_ACCESS_TOKEN?: string }>;
