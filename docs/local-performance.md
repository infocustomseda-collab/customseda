# Local performance verification — 2026-10-26

Measured on `master` with Chrome DevTools MCP's isolated profile, using the local homepage, a 390 × 844 viewport at DPR 3, 4× CPU slowdown and Slow 4G.

## Finding and change

Live development content had no responsive derivatives, so the homepage loaded the original 2048 × 1365 PNG hero (about 3.5 MB) and large original product photos. Chrome identified about 5.9 MB of potential image savings among the loaded images.

`pnpm dev` now prepares local draft images before starting. Live CMS reads reuse the prepared derivatives by immutable R2 storage key. Text/settings remain live; new uploads fall back to their originals until `pnpm images:local` runs. Remote snapshots are not used to annotate local development content.

The tested mobile hero is now a 1440-pixel WebP of 89,954 bytes, about 97% smaller. The existing responsive-image pipeline and visual design are preserved.

## Verification

- Optimized development cold-load trace: LCP 5.4 s; CLS 0.
- Local production preview, after unregistering the service worker and clearing Cache Storage in the isolated profile: LCP 2.293 s; CLS 0; document TTFB 6 ms.
- A separate warm service-worker run measured LCP 204 ms; this is not a cold-load result.
- The initial development trace included a hot reload during the branch switch, so its LCP is not used as a controlled before/after comparison.
- These are lab traces, not a Lighthouse performance score or remote acceptance results. No deployment occurred.
- `pnpm test`: 169 passing tests.
- `pnpm typecheck`: 0 errors, 0 warnings, 2 existing hints in the design component examples.
- `pnpm build:local-preview`: passed; 40 static pages validated. The static validator now accepts Astro's valid redirect documents with omitted optional `<html>` tags, while still rejecting the known EmDash error responses.

## Repeat locally

Stop the dev server, then run `pnpm build:local-preview` and `pnpm preview`. Audit the printed URL in Chrome Lighthouse with consistent device/settings. This build includes local drafts and must be rebuilt after edits. `pnpm build` still snapshots published content only. Do not run dev and preview simultaneously against the same local runtime state.
