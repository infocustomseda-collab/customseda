# Custom Seda Catalog Model Implementation Plan

> Execute inline with superpowers:executing-plans. Phase 2 only; remain on master and do not deploy remotely.

**Goal:** Supply local CMS editing forms for the approved shop model and enforce valid purchasable bundles.
**Architecture:** Seed definitions for fresh databases, an idempotent authenticated model migration for existing databases, pure catalog rules, database-backed snapshot reading, and native runtime policies plus REST write validation.
**Tech Stack:** Existing pinned Astro/EmDash/Cloudflare runtime, Kysely, Node's test runner, SQLite/runtime tests and isolated D1 integration tests.
**Spec:** Phase 2 and agreed requirements in 2026-10-24-custom-seda.md; user-approved separation of Products and Conjuntos.

## Global constraints

No inventory, no Tailwind, no remote changes. Product category/collection/color are single references; sizes multiple. Top S–XL, Braguita XS–XL. Conjuntos link one of each component with their own price and gallery, no size/color/collection duplication. Keep existing content and auth credentials.

## Review focus

- Reference-only PUT/PATCH requests must not bypass bundle rules.
- Publish must use staged fields and references, not stale live snapshots.
- Component deletion/recategorization/unpublication must not break existing bundle links.
- Reapplying the model must preserve editorial content and IDs.
- Draft editing remains possible while publication enforces images and published dependencies.

## Tasks

- [x] Create a minimal catalog seed: six catalog types plus Pages, Size Guides, Site Settings, Popups, Shipping Rules; native reference cardinality, ordered image repeaters, starter lookup records.
- [x] Write failing pure-rule tests, implement `validateCatalogEntry`, validate prices, galleries, size/category compatibility, component types and matching collection/color.
- [x] Implement `readCatalogEntry` / `validateCatalogWrite` database adapters and native lifecycle policies. Add real SQLite/runtime tests for ref-only updates, staged publication, and dependent-entry protection.
- [x] Implement the local authenticated POST model migration and the CLI-only remote deployment step with a version marker and non-destructive repeat behavior. Validate seed and migration on a fresh test database twice.
- [x] Apply migration to the existing local D1 database through the authenticated API, hide starter Posts, regenerate CMS types, and exercise forms/API writes locally.
- [x] Run full tests, Astro checks/build, fresh review, and document editor workflow and remaining remote acceptance checks.
