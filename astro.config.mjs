import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { cloudflareEmail } from "@emdash-cms/cloudflare/plugins";
import { cmsEmailSettings } from "./scripts/config/cms-email.mjs";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import { readFileSync } from "node:fs";
import { routePrerender } from "./src/lib/build/route-mode.ts";
import { assertBuildEnvironment, SNAPSHOT_PATH } from "./src/lib/shop/snapshot.ts";

/** @param {string} family @param {number} weight @param {"normal" | "italic"} style */
const fontsource = (family, weight, style) => ({
	weight,
	style,
	src: [`./node_modules/@fontsource/${family}/files/${family}-latin-${weight}-${style}.woff2`],
});

// SITE_MODE=preview builds the server-rendered preview Worker; anything else is the static public build.
const isPreview = process.env.SITE_MODE === "preview";
const remoteDev = !!process.env.CUSTOMSEDA_REMOTE_DEV;
const emailSettings = cmsEmailSettings(JSON.parse(readFileSync(new URL('./wrangler.jsonc',import.meta.url),'utf8')),
    process.env.CUSTOMSEDA_REMOTE_DEV ?? process.env.CLOUDFLARE_ENV);

export default defineConfig({
	output: "server",
	outDir: isPreview ? "./dist-preview" : "./dist",
	vite: { define: { "import.meta.env.SITE_MODE": JSON.stringify(isPreview ? "preview" : "public") } },
	// Public pages prerender to <path>.html so they keep the existing slash-free public paths.
	build: { format: "file" },
	trailingSlash: "never",
	i18n: {defaultLocale: "es", locales: ["es"]},
	// Phase 6 adds build-time derivatives; avoid runtime image-transform usage now.
	adapter: cloudflare({ imageService: "passthrough", ...(remoteDev ? {
        configPath: process.env.CUSTOMSEDA_DEV_WRANGLER,
        remoteBindings: true,
        persistState: { path: `.wrangler/dev-${process.env.CUSTOMSEDA_REMOTE_DEV}` },
    } : {}) }),
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
			migrations: { runtime: "check", dev: remoteDev ? "check" : "auto" },
			plugins: [...(emailSettings ? [cloudflareEmail(emailSettings)] : []), {
				id: "customseda-catalog", version: "0.1.0", format: "native",
				entrypoint: new URL("./src/lib/cms/plugin.ts", import.meta.url).pathname,
			}],
		}),
        {
            name: "customseda-catalog-routes",
            hooks: {
                // Staging content must never prerender into a production build, or the other way round.
                "astro:build:start"() {
                    if (isPreview) return; // preview reads live content, not the snapshot
                    assertBuildEnvironment(JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")), process.env.CLOUDFLARE_ENV);
                },
                // Only our own pages; EmDash's and the injected customseda routes are already server routes.
                "astro:route:setup"({ route }) {
                    if (!route.component.startsWith("src/pages/")) return;
                    const prerender = routePrerender(isPreview ? "preview" : "public", route.prerender);
                    if (prerender !== undefined) route.prerender = prerender;
                },
                "astro:config:setup"({ injectRoute, injectScript }) {
                    if (process.env.CLOUDFLARE_ENV === 'production') injectScript('page', 'import "/src/scripts/admin-preview.ts";');
                    injectRoute({pattern: "/_emdash/api/customseda/preview", entrypoint: "./src/lib/cms/preview-route.ts", prerender: false});
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
