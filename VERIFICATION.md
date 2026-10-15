# Verification — 2026-10-15

## Executed

- `npm run check`: build and six automated tests passed.
- Portable `plugin.json` and `mcp.json` validated against the published Agent Plugins 1.0.0 JSON Schemas; both bundled skills passed the Skill Creator validator.
- Built distribution copied into a fresh temporary directory, then started through a real MCP stdio client without relying on repository `node_modules`.
- Actual tool discovery verified global and thread entrypoints and native settings capability; native settings read returned schema and effective values.
- Published a public fixture edition, reopened it, and verified persisted identity and content. A stale revision returned an error and kept the previous edition.
- Source exclusion, local/IP and credential URL checks; plain-text escaping; successful source references; duplicate story handling; all-failed update preservation; concurrent revision conflict.
- Browser test host with the real MCP server: empty state; saving preferences; excluded-source rejection; repaired error wording; update message submission; fixture publication; automatic display of new edition; source-link opening request.
- Visually inspected the normal-width public example, a 390px app frame, and its preferences dialog. No decorative numbering or unsupported weather/calendar/metric content is used. Dates and source/story counts are actual metadata for the fixture.

## Explicit limits

- Browser host is a local test harness. The generated edition in this harness is a public fixture, not a model-generated live newspaper.
- Sidebar/panel/settings rendering in the user's running Codex application has not been verified through a real plugin installation.
- Current-conversation generation, browser-history integration, private-source reads and live host-specific message handling have not been tested end to end in a production host.
- No public plugin-directory approval, remote hosting, automated background refresh, or browser extension is part of this release.
- Semantic correctness and actually observed article links require source reading by the conversation; structural validators cannot prove them.

## Reproduce

Run `npm ci && npm run check` for automated checks. Run `npm run preview` and open the printed loopback URL for the browser test harness. Use `?narrow` for a 390px frame. Install the repo marketplace to check native host surfaces separately.
