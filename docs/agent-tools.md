# Agent tools

The documentation servers below are registered in the local Codex host's user-level MCP configuration. Skills are project-local under `.agents/skills/` and are loaded when relevant to a task.

## Connected MCP servers

| Name | Endpoint / command | Purpose |
| --- | --- | --- |
| `astro-docs` | `https://mcp.docs.astro.build/mcp` | Official Astro documentation search |
| `emdash-docs` | `https://docs.emdashcms.com/mcp` | Official EmDash documentation search |
| `cloudflare-docs` | `https://docs.mcp.cloudflare.com/mcp` | Official Cloudflare documentation search |
| `chrome-devtools` | `pnpm dlx chrome-devtools-mcp@1.12.0 --headless --isolated --no-usage-statistics --no-performance-crux` | Network inspection and performance tracing in a separate temporary Chrome profile |

The local browser launcher uses absolute installed pnpm/Node paths and a service-specific PATH so it also starts outside this project, without relying on a mise project shim. Chrome DevTools MCP has update checks disabled with `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`. It does not attach to the user's existing browser profile. Chrome is launched only when a browser-dependent tool is called. The package version is pinned; update it deliberately after reviewing its release notes.

The documentation servers require no site credentials. No Cloudflare account MCP or EmDash content-management MCP has been connected. Documentation queries should contain API questions, not private code, credentials or customer data.

These MCP registrations are host configuration, not part of the website deployment. On another machine, register the documentation servers with `codex mcp add <name> --url <endpoint>` and register the browser command with `codex mcp add chrome-devtools --env CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 -- pnpm dlx chrome-devtools-mcp@1.12.0 --headless --isolated --no-usage-statistics --no-performance-crux`.

## Installed official skills

| Source | Skills | Pin |
| --- | --- | --- |
| [EmDash](https://docs.emdashcms.com/agent-skills/) | `building-emdash-site`, `creating-plugins`, `emdash-cli` | EmDash 1.3.1 release commit `12a179389f07821beb819a684e62627e6017ba8d` |
| [Cloudflare](https://github.com/cloudflare/skills) | `cloudflare`, `workers-best-practices`, `wrangler`, `workers-profiling`, `web-perf` | Commit `86505e44f87d801aa1864a3c4109e9a8ae5c409f` |

Upstream skill files are unchanged. Source refs and SKILL.md SHA-256 hashes are recorded in `.agents/skills/sources.json`; vendor licenses are retained alongside it. Reinstall with the bundled Codex skill installer using the recorded repository, ref and `skills/<name>` paths, with `.agents/skills` as the destination. The installer refuses to overwrite existing skills; review updates rather than silently replacing these copies.

Repository requirements take precedence over vendor defaults: Free tier, native plugins only, migrations outside deployed requests, and the later build-time public snapshot. Current online documentation may describe newer versions; installed package types/source and the pinned skill release remain the compatibility baseline.

## Verification

Installation checks established MCP connections and listed tools on all four servers. The three documentation servers expose their expected search tools, and a small public documentation search succeeded on each. Setup checks printed connection/search status rather than the full returned documentation. Chrome DevTools exposes network and performance trace tools. These checks did not open a browser, visit the storefront/admin, access a Cloudflare account, or deploy the website.

Skills can be discovered on the next turn. MCP tools are loaded by the Codex host; start a new local chat if the current chat does not refresh its tool inventory.
