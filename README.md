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

## How an edition is prepared

The conversation reads `morning_tab_read_plan`, checks candidate URLs, reads up to eight chosen public sources with available tools, and saves a concise edition through `morning_tab_publish_edition`. Each story cites a successfully read source; the first story is the lead. Unknown publication dates remain unknown. Preferences and revisions are checked again before saving, so an outdated refresh cannot overwrite a newer edition.

See the [tool data contract](plugins/morning-tab/references/data-contract.md) and the [editorial skill](plugins/morning-tab/skills/morning-tab/SKILL.md). URL/provenance validation checks structure and exclusions; factual summaries and actually observed destination links remain the responsibility of the authoring conversation.

The update button requests work in the current conversation. It does not run a separate model in the background. The app polls for the saved result for up to ten minutes after that explicit request, while keeping the previous edition readable.

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

---

## 中文说明

**把你关注的网站，编成一份可以在 ChatGPT / Codex 内阅读的晨报。**

这是按照你提供的 [OpenAI MCP Extensions](https://developers.openai.com/plugins/build/extensions) 机制实现的原生插件：声明全局侧栏入口、对话侧面板入口和原生插件设置。配色与排版借鉴纸质晨报，保留真实来源链接。

安装命令见上方。安装并重新打开会话后，可以说：

> 帮我设置 Morning Tab，关注开源和 AI 工程，用中文整理这些公开网站：……

之后直接说“更新我的晨报”，或者在插件内点击更新。当前会话负责读取来源和整理内容，本地 MCP 服务负责保存和展示。无需额外模型 API Key，消耗现有会话的可用额度；不会自动创建周期任务。

默认只读取你选择的公开网站。插件不自带浏览历史读取功能；如要参考近期浏览，需要另外可用的浏览器工具和你的授权。读取的网页文字会进入当前 Codex / ChatGPT 对话。个人晨报保存在本机，不随开源仓库发布。

已验证构建、真实 MCP 协议、保存与重新读取，以及浏览器测试宿主中的交互和排版。截图是公开样例。你当前客户端里的真实安装、原生入口展示与完整网页生成链路仍需要安装后核验；GitHub 开源不等于已通过官方插件目录审核。
