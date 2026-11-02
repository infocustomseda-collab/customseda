# Phase 9 Free-tier acceptance — 2026-11-02

Read-only evidence gathered from production (`customseda`, D1 `ef91b5bb…`, bucket `customseda-production-media`). Nothing was written or redeployed for these checks.

## Content and media survive redeployment

Deploy [run 41325183028](https://github.com/infocustomseda-collab/customseda/actions/runs/41325183028) (PR #40) finished production at 2026-11-01 16:16 UTC, after the 2026-11-01 admin photo upload and the earlier PR #39 deploy. Afterwards:

- `/collections/bikinis` and all 16 product pages it links return 200.
- All 40 product images on that page, served from R2 through `/_emdash/api/media/file/…`, return 200 with their full size.

## Platform limits

Current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free allows 10 ms CPU per request and per Cron Trigger (occasional overruns are tolerated, consistent ones are terminated), 128 MB memory, 1 s startup, 100,000 requests per day and 50 subrequests per request. Worker size counts only uncompressed (64 MiB); there is no compressed size limit.

| | Production | Limit |
| --- | --- | --- |
| Worker upload (run 41325183028) | 19,569 KiB / 5,085 KiB gzip | 64 MiB uncompressed |
| Worker upload with only `en`/`es-ES` admin catalogs (PR #41, dry run) | 12,443 KiB / 2,759 KiB gzip | |
| Startup time | 25 ms | 1 s |

## Worker requests and CPU (Workers analytics, 2026-10-30 to 2026-11-01)

| Day (UTC) | Requests | CPU p50 | CPU p99 | CPU p99.9 | Failures |
| --- | --- | --- | --- | --- | --- |
| 2026-10-30 | 1,707 | 3.3 ms | 85 ms | 188 ms | 0 |
| 2026-10-31 | 625 | 7.0 ms | 116 ms | 611 ms | 1 `exceededResources` (09:00 UTC hour, 345 ms CPU) |
| 2026-11-01 | 784 | 3.0 ms | 131 ms | 743 ms | 0 |

Most requests stay under 10 ms. Admin work (saves, publication, upload confirmation at 742 ms) overruns it in occasional bursts, which Free tolerates. The single production failure was in the hour of the 2026-10-31 publish → rebuild check. Staging's earlier `exceededResources` (179 on 2026-10-27, 6 on 2026-10-30) were the site import and previews before the shared-data model.

## Hourly cron

`wrangler tail customseda` captured the 2026-11-02 00:00 UTC run of `0 * * * *` (rebuild check, then EmDash maintenance): outcome `ok`, 59 ms CPU, 8,021 ms wall, no exceptions or logs. The `workersInvocationsScheduled` analytics dataset returned no rows for the week, so the tail is the only record.

59 ms is above the Free 10 ms per Cron Trigger on every run, not occasionally. It passed; if runs start failing with `exceededResources`, scheduled publication and menu/category rebuild requests stop until the cron is lightened or the plan changes.

## Storage and database usage

| | Usage | Free limit |
| --- | --- | --- |
| D1 rows read, busiest day since production (2026-10-30) | 278,044 | 5,000,000 / day |
| D1 rows written, busiest day | 12,229 | 100,000 / day |
| D1 size (2026-11-01) | 2.98 MB | 500 MB per database |
| R2 stored (2026-11-01) | 97 objects, 214 MB | 10 GB |
| R2 writes (Class A) / reads (Class B), 2026-10-26 to 2026-11-01, all buckets | ~530 / ~5,000 | 1M / 10M per month |
