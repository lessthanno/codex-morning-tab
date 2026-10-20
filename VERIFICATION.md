# Verification

## 0.1.2 connection recovery and background service — 2026-10-21

- The actual app source reproduced both failures before the fix: the first state read could disable the view permanently, and a successful recovery could retain its error feedback. The regression suite failed these two scenarios before the change and passes after it. Waiting-for-edition feedback, one refresh request, and teardown remain covered.
- `npm run check` builds the stdio server, HTTP service and UI. The 15 tests cover recovery, URL/provenance validation, data preservation, MCP metadata, HTTP negotiation, concurrent revision conflicts and service restart persistence. Personal editions are not used by these tests.
- Real Chrome, real MCP server and the browser test host: an injected first-read failure recovered; a sustained simulated read interruption retained the edition; restoring the connection cleared the error; a simulated conversation edit appeared with `View loads: 1`. Generation in this host uses a public fixture, not a model. Screenshots are retained in this chat's outputs.
- The macOS installer upgraded the existing service to 0.1.2, registered the generated marketplace with the same plugin identity, verified the cached UI hash, and removed the duplicate manual connection. `/health` reported version 0.1.2 and revision 7; the saved edition identity remained unchanged.
- A failed attempt to switch Node executables exercised rollback: the previous service and plist were restored and the old service resumed. Upgrading with the existing working runtime then succeeded. The installer now preserves that runtime by default.
- The live Codex tool can read the saved plan. The existing app document needs to be reopened once to load the new JavaScript; live Codex visual acceptance remains unverified. Test-host success is not native-client visual acceptance.

## Earlier verification — 2026-10-15

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

## Local fix 0.1.1 — repeated panels during conversation edits

User report: every conversational modification opens another newspaper tab/panel. Source investigation found that `morning_tab_publish_edition` advertised a UI resource, the editorial skill unconditionally called `morning_tab_open` after saving, and existing views only polled after their own Update action.

Changed behavior:

- Publishing, planning, state reads, and preference saves have no UI resource metadata. Only explicitly requested open actions render a new view.
- Separate global and conversation-panel entrypoint tools, with one entrypoint per tool. UI resource is versioned to v2 to avoid reusing the old cached UI.
- Existing views read `morning_tab_get_state` while visible and apply new revisions in place, including ordinary conversation edits. Unchanged reads preserve the page DOM. Teardown discards pending reads; hidden documents pause and catch up on return.
- The plugin skill, open-tool descriptions, app update request, and visible-view context all preserve the existing view after ordinary edits.

Verification performed for this fix:

- `npm run check`: build and 10 tests passed. Added two sequential protocol edits with data-only tools, and tests for ongoing synchronization, visibility pause/resume, temporary failure recovery, and teardown during a pending read.
- Real local MCP test host, simulated conversation authoring: first Update completed, then two outer-host conversation-edit actions saved distinct revisions. The lead changed on each edit inside the same iframe; `View loads: 1` remained constant. This is browser evidence of the MCP App synchronization behavior, not a screenshot of the Codex application.
- Installed `morning-tab@morning-tab-plugins` version 0.1.1 through supported CLI commands. The marketplace now points to this local owning repository, preserving the plugin identity. The GitHub release was not changed.
- Actual installed distribution was started with an isolated temporary data directory. Tool discovery and a harmless state read passed; installed server/UI/skill hashes match the source package. The checksum of the existing personal `state.json` remained unchanged across the update.
- CLI reports 0.1.1 installed and enabled. Already-running conversations, MCP processes, and app tabs are not proof of having reloaded the new version.

Remaining check: computer-use safety rules denied access to the Codex native application itself. Therefore the user's exact running host could not be directly reproduced or visually verified. Fully quit/reopen Codex once, close the old duplicate panels, open Morning Tab once, then make consecutive edits in the same conversation to verify native-host behavior. No further open call should be needed after each save.
