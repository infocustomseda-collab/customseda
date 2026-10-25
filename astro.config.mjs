import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	i18n: {defaultLocale: "es", locales: ["es"]},
	// Phase 6 adds build-time derivatives; avoid runtime image-transform usage now.
	adapter: cloudflare({ imageService: "passthrough" }),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			// Never run remote core migrations during an HTTP request.
			migrations: { runtime: "check", dev: "auto" },
			plugins: [{
				id: "customseda-catalog", version: "0.1.0", format: "native",
				entrypoint: new URL("./src/lib/cms/plugin.ts", import.meta.url).pathname,
			}],
		}),
        {
            name: "customseda-catalog-routes",
            hooks: {
                "astro:config:setup"({ injectRoute }) {
                    injectRoute({
                        pattern: "/_emdash/api/customseda/model",
                        entrypoint: "./src/lib/cms/model-route.ts",
                        prerender: false,
                    });
                    injectRoute({
                        pattern: "/_emdash/api/customseda/import",
                        entrypoint: "./src/lib/cms/import-route.ts",
                        prerender: false,
                    });
                },
            },
        },
	],
	devToolbar: { enabled: false },
});
