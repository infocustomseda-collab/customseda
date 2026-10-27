# Retire the completed import

> **For agentic workers:** Use superpowers:executing-plans for this cleanup.

**Goal:** Remove retired import tooling and metadata, retain editable catalog content and URLs, preserve image originals, and replace the privacy policy.

**Architecture:** A versioned EmDash model migration removes source fields, revision metadata and import options. A local media export stores byte-verified originals outside generated public assets. Privacy content remains editable in EmDash.

**Tech Stack:** Astro 7.4.2, EmDash 1.3.1, local Cloudflare D1/R2, Stripe Checkout.

**Spec:** The user's approved scope in this chat: remove obsolete import reports too; keep public URLs; originals in assets/originals with products separate; keep EmDash/R2.

## Global constraints

- Work in this checkout on the user-selected feature/clean_shopify branch; preserve the existing Bikini menu edit.
- Local work only. No deploys or remote database writes.
- Keep IDs, catalog content, prices, relationships, gallery order and draft/publication states.
- Back up local D1 before removal. Keep ignored recovery backups.
- Do not invent legal identity, retention periods or services absent from the implementation.

## Review focus

- Pending revisions must not restore removed metadata.
- Applying the model again must not recreate import fields.
- Original image bytes and CMS references must survive unchanged.
- Existing and fresh databases must both support incomplete native drafts while publication validation remains strict.
- Replacing legal text must update the draft the storefront actually reads.

## Tasks

- [x] Add and test an idempotent model cleanup covering legacy fields, physical columns, revisions, mappings and the home settings slug; retain unrelated fields/content.
- [x] Export all original media with hashes, split catalog and site images, and verify each file against R2.
- [x] Remove the retired import route, scripts, tests and reports; update commands, documentation and CMS types.
- [x] Replace the Spanish privacy policy with implementation-based text and provider links; preserve draft status.
- [x] Run unit tests, isolated D1 integration, typecheck and a local draft build. Compare catalog and media before/after.

## Execution notes

User approval covers the cleanup above. The user clarified that the master-only rule was temporary or mistaken, requested its removal, and authorized committing, pushing and opening a pull request on feature/clean_shopify.

Verification: all 95 archived originals match their manifest hashes; all 96 media rows and all 16 catalog rows are unchanged apart from removed source columns. No text/JSON Shopify values remain in the active local database. The draft build checks 40 static pages. Review identified an interrupted-D1 retry case; the migration now removes orphaned physical columns and has a regression test.

Final checks: 173 unit tests passed; isolated local D1 integration passed; typecheck reports zero errors and two pre-existing deprecation hints in design examples. Local cleanup verification preceded the separately authorized commit, push and pull request. No deployment was performed.
