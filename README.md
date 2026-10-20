# Morning Tab

**Your internet, edited into a newspaper — inside ChatGPT and Codex.**

Morning Tab is a local MCP plugin built with [OpenAI MCP Extensions](https://developers.openai.com/plugins/build/extensions). Open it from the global sidebar or beside a conversation, choose your reading sources, and ask your current conversation to prepare a sourced edition.

![Public example newspaper; this browser preview is not a screenshot of the Codex host](plugins/morning-tab/assets/preview.jpg)

The screenshot is a public example in a standalone browser preview. It contains no personal browsing history. Native placement depends on the host's supported extensions.

## What it does

- Registers **global sidebar** and **conversation-panel** entrypoints.
- Exposes **native plugin settings** for sources, exclusions, language, timezone, interests, and newspaper title.
- Sends a user-initiated **Update newspaper** request to the active conversation through MCP Apps / OpenAI Extensions messaging.
- Stores source-backed editions locally and keeps the previous edition when validation or generation fails.
- Updates an already-open newspaper in place when you edit through conversation. Saving does not open another tab or panel; opening a view is an explicit action.
- Renders a responsive paper-and-serif newspaper with source links and explicit read failures.

Your current Codex/ChatGPT conversation does the reading and editing using its available web/browser tools. The MCP server stores and presents the result. There is **no separate model API key, nested Codex process, browser extension, or autonomous schedule**. Work uses your current session and its limits.

## Install in Codex

Requires **Node.js 22+**, a Codex version with plugin marketplace support, and a host that supports MCP Apps. Native sidebar/panel/settings availability varies by host and rollout. A compatible web-reading tool is needed to prepare real editions.

```sh
codex plugin marketplace add lessthanno/codex-morning-tab
codex plugin add morning-tab@morning-tab-plugins
```

Reopen Codex or start a fresh conversation so the installed plugin is loaded. Run the plugin's setup workflow, or ask:

> Set up Morning Tab. I follow open-source software and AI engineering. Use these public sources: https://github.com/ThariqS/ai-newtab and https://developers.openai.com/plugins/build/extensions. Prepare an English edition.

Open **Morning Tab** from the sidebar or conversation panel when your host exposes the registered entrypoints. The Preferences button and native plugin settings edit the same stored preferences. Then select **Update newspaper**, or say:

> Update my Morning Tab from my saved sources.

If the host offers regular MCP tools but not native entrypoints, use `morning_tab_open` from the conversation. Do not assume successful installation means every extension surface is supported.

The repository includes prebuilt, self-contained server and UI bundles, so end users do not need to run `npm install`. To inspect or build from source:

```sh
git clone https://github.com/lessthanno/codex-morning-tab.git
cd codex-morning-tab
npm ci
npm run check
codex plugin marketplace add .
codex plugin add morning-tab@morning-tab-plugins
```

Alternatively configure the bundled stdio MCP server in an MCP client:

```json
{
  "mcpServers": {
    "morning-tab": {
      "command": "node",
      "args": [
        "/absolute/path/to/codex-morning-tab/plugins/morning-tab/dist/server.mjs"
      ]
    }
  }
}
```

The adjacent `dist/app.html` file must stay beside `server.mjs`. This is a desktop/local-server distribution; it is not a hosted HTTPS connector or an approved listing in the public plugin directory.

### Optional macOS background service

For a persistent local service that starts at login and restarts after an unexpected exit, run these commands from this repository:

```sh
npm ci
npm run check
npm run service:install
```

The installer keeps the `morning-tab@morning-tab-plugins` identity. It installs a self-contained HTTP server and a generated local marketplace under `~/Library/Application Support/MorningTab/`, then uses the supported Codex CLI to install that package. Upgrades preserve the existing service's Node executable without relying on the GUI app's PATH; set `MORNING_TAB_NODE` to select another executable explicitly. The installer backs up the previous installation, restores the old service if startup fails, and removes only a duplicate manual MCP connection pointing at this exact endpoint. Personal editions stay in their original data directory. Installed cache files need no manual edits.

The service listens only on `127.0.0.1:47855`. Its MCP endpoint is `/mcp`; `/health` reports the service version and saved revision, rather than rendering a newspaper. Check or restart it with:

```sh
npm run service:status
npm run service:restart
```

After a plugin upgrade, reopen the newspaper once to load the new app JavaScript. Ordinary edition edits continue to update that existing view. Selecting **Update newspaper** still requests reading and generation in your current conversation. The service does not generate on a schedule or run another model process.

Version 0.1.2 retries a failed first state read and clears connection errors after recovery, while keeping the existing edition readable and preserving a pending refresh notice.

## How an edition is prepared

The conversation reads `morning_tab_read_plan`, checks candidate URLs, reads up to eight chosen public sources with available tools, and saves a concise edition through `morning_tab_publish_edition`. Each story cites a successfully read source; the first story is the lead. Unknown publication dates remain unknown. Preferences and revisions are checked again before saving, so an outdated refresh cannot overwrite a newer edition.

See the [tool data contract](plugins/morning-tab/references/data-contract.md) and the [editorial skill](plugins/morning-tab/skills/morning-tab/SKILL.md). URL/provenance validation checks structure and exclusions; factual summaries and actually observed destination links remain the responsibility of the authoring conversation.

An open newspaper checks saved revisions while visible, so ordinary conversation edits appear in that same view. Unchanged checks preserve the existing page DOM. Hidden views pause these checks and catch up when shown again.

The update button requests work in the current conversation. It does not run a separate model in the background. The app keeps the previous edition readable while waiting for the saved result. After ten minutes without a new edition it reports that status; the view can still synchronize later.

## Local data and privacy

State is stored in `~/.local/share/codex-morning-tab/state.json`, with restrictive permissions for newly created files and directories. Override the directory with `MORNING_TAB_DATA_DIR` in your MCP server environment. Package files are separate from personal editions.

The MCP server performs no network retrieval. The app UI connects through the host's MCP bridge, without remote fonts, images, trackers, or a public endpoint. The conversation's reading tools send retrieved source text to the service running that conversation under its own policies. Private logged-in content is outside the default scope.

Browser history is **not included** in this package. If you explicitly request history-based selection, the skill requires a separately available, authorized browser-history tool. It does not read browser-profile databases. A manual source list always works without history access.

No recurring job is created by installation or normal refresh. Do not commit or publish personal editions, browser history, or private source content when contributing.

## Development and verification

```sh
npm ci
npm run check
npm run preview
```

`npm run preview` opens a local MCP test host at `http://127.0.0.1:47854` (open it yourself). Add `?narrow` to test the app in a 390px frame. This host uses the real bundled MCP server and **simulates conversation generation with the public example**. It is not the Codex/ChatGPT host and makes no model API calls.

Tests cover URL exclusions, provenance references, escaping, failed-update preservation, revision conflicts, and real stdio MCP negotiation from an isolated copy of the distribution. Protocol checks include global/thread metadata, native settings discovery, resource loading, persistence, and reopening an edition. Browser checks cover preferences, validation errors, update messaging, source-link requests, and narrow layout.

The current release has not been verified as installed and rendered in every supported Codex/ChatGPT host. Full live source-reading and host-specific UI behavior should be checked after installation. See [verification details](VERIFICATION.md).

## Credits and license

Inspired by [ThariqS/ai-newtab](https://github.com/ThariqS/ai-newtab) and its personal-newspaper idea. This is an independent MCP Extensions implementation, not a fork of its Anthropic agent architecture. Built with the official [OpenAI MCP Extensions SDK](https://github.com/openai/mcp-extensions) and MCP SDKs.

MIT for this project's source. Bundled dependencies retain their own licenses; see `plugins/morning-tab/dist/THIRD-PARTY-LICENSES.txt`. This community project is not affiliated with or endorsed by OpenAI.
