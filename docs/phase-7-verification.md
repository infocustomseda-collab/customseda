# Phase 7 publishing acceptance — 2026-10-31

The user authorized a new product using their supplied `elamadonna.png`, then explicitly authorized choosing sample product data. The product remains in production as TOP BRISA, €35, Top category, Turquesa material, Margarita collection; Spanish locale. No existing product was overwritten.

## Configuration and deployment

- `GITHUB_REBUILD_TOKEN` setup, owner and expiry were already recorded in deployment.md on 2026-10-30.
- GitHub API confirmed both deployment flags are `true`.
- [Push run 41156877509](https://github.com/infocustomseda-collab/customseda/actions/runs/41156877509) passed verification, production and staging. Production completed at 01:48:32 UTC; staging started at 01:48:35 UTC.

## Pre-write recovery data

Private, Git-ignored files under `backups/phase7-before-top-brisa-2026-10-31/` contain schema and rows from 83 ordinary database tables (FTS and SQLite/Cloudflare internal tables excluded), plus all 211 R2 objects (421,569,269 bytes) and a key/file/size/SHA-256 manifest. Every saved object passed a local size and SHA-256 check. A production D1 Time Travel bookmark is stored separately under ignored backups. These are recovery inputs, not evidence of a tested restore; phase 8 remains open for scheduled backups, keys/authentication recovery and restore/rollback rehearsals.

The native EmDash site export repeatedly returned HTTP 503 during media export and remained at `export_media: 0/30`. Its CLI polling was interrupted after the binding-based backup completed; it is not counted as a successful export. Investigate this separately during backup/CMS acceptance.

## Draft and publication

Official EmDash CLI device authorization succeeded as an administrator. The photo uploaded through `emdash media upload`: ready, 3,526,810 bytes, 2048 × 1365. The official EmDash client created draft `01M68M229SFW4PSZM41PDX49X3` (`top-brisa`) with native references and assigned its native category through EmDash's terms endpoint. The client was used because the CLI create command does not expose reference or term assignments.

Before publishing:

| Request | Status | Result |
| --- | --- | --- |
| Production `/products/top-brisa` | 404 | No draft title or photo |
| Anonymous staging, same path | 401 | No draft title or photo; private/no-store, noindex/nofollow |
| Staging with existing Basic reviewer credential | 200 | Draft title and photo; private/no-store, noindex/nofollow |

`emdash content publish` succeeded and triggered [workflow_dispatch run 41188206725](https://github.com/infocustomseda-collab/customseda/actions/runs/41188206725). Production completed successfully; verification and staging jobs were skipped as expected for a production CMS dispatch. No manual dispatch substituted for the publishing hook.

After deployment, [TOP BRISA](https://customseda.customseda.workers.dev/products/top-brisa) returned 200 and displayed its title, €35 price and uploaded photo. No code deployment was needed to add the product.

## Responsive images

All three public derivative responses were 200 with `image/webp`; actual downloaded bytes were decoded with Sharp to verify format and dimensions:

| Width × height | Bytes |
| --- | --- |
| 480 × 320 | 18,840 |
| 960 × 640 | 51,196 |
| 1440 × 960 | 89,954 |

The HTML contains all three widths in `srcset` and `sizes="(min-width: 60em) 50vw, 100vw"`. Chrome DevTools in an isolated browser context confirmed the image finished loading and selected the 960 px WebP as `currentSrc`. Resizing occurs during the production build; the original remains available through EmDash.

Phase 7 is complete. The editor-session “View site” handoff, complete CMS request/CPU acceptance, scheduled backups and recovery rehearsals remain in phases 8–9.
