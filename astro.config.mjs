import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import { readFileSync } from "node:fs";
import { assertBuildEnvironment, SNAPSHOT_PATH } from "./src/lib/shop/snapshot.ts";

/** @param {string} family @param {number} weight @param {"normal" | "italic"} style */
const fontsource = (family, weight, style) => ({
	weight,
	style,
	src: [`./node_modules/@fontsource/${family}/files/${family}-latin-${weight}-${style}.woff2`],
});

export default defineConfig({
	output: "server",
	// Public pages prerender to <path>.html so they keep the existing slash-free public paths.
	build: { format: "file" },
	trailingSlash: "never",
	i18n: {defaultLocale: "es", locales: ["es"]},
	// Phase 6 adds build-time derivatives; avoid runtime image-transform usage now.
	adapter: cloudflare({ imageService: "passthrough" }),
	// Self-hosted from the pinned @fontsource packages (latin subset); no CDN fetch during builds.
	fonts: [
		{
			provider: fontProviders.local(),
			name: "Cormorant",
			cssVariable: "--font-cormorant",
			fallbacks: ["Georgia", "serif"],
			options: {
				variants: [
					fontsource("cormorant", 500, "normal"),
					fontsource("cormorant", 500, "italic"),
					fontsource("cormorant", 600, "normal"),
					fontsource("cormorant", 700, "normal"),
					fontsource("cormorant", 700, "italic"),
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: "Montserrat",
			cssVariable: "--font-montserrat",
			fallbacks: ["sans-serif"],
			options: { variants: [fontsource("montserrat", 700, "normal")] },
		},
	],
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
                // Staging content must never prerender into a production build, or the other way round.
                "astro:build:start"() {
                    assertBuildEnvironment(JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")), process.env.CLOUDFLARE_ENV);
                },
                "astro:config:setup"({ injectRoute }) {
                    injectRoute({
                        pattern: "/_emdash/api/customseda/model",
                        entrypoint: "./src/lib/cms/model-route.ts",
                        prerender: false,
                    });
                    injectRoute({
                        pattern: "/_emdash/api/customseda/rebuild",
                        entrypoint: "./src/lib/cms/rebuild-route.ts",
                        prerender: false,
                    });
                },
            },
        },
	],
	devToolbar: { enabled: false },
});
