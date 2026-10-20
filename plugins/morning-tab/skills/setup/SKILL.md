---
name: setup
description: Set up Morning Tab's reading sources and preferences, and help open its native sidebar or conversation panel.
---

Morning Tab is an OpenAI MCP Extensions app. It registers a global sidebar entry, a conversation-panel entry, and native plugin settings. The bundled MCP server stores preferences and editions locally; it does not call a model API, read the browser, or schedule work by itself.

Call `morning_tab_read_plan` to inspect existing preferences. Reuse the user's supplied sources, language and interests. If source URLs are missing, ask for the websites or topics they want to follow. For topic-only requests, discover suitable public sources with available web tools and propose/save a small source list consistent with that request. Do not silently use browser history.

Use the native plugin settings page when available, or the Preferences dialog inside `morning_tab_open`, to save changes. Settings are primitive string fields: `masthead`, `language` (BCP 47), `timezone` (IANA), `topics`, `sourceUrls` (one HTTPS URL per line, up to eight), `blockedDomains` (one domain per line; includes subdomains). Changes affect the next edition. The app's settings dialog calls the app-only save tool.

When the user explicitly asks to open the newspaper, call `morning_tab_open`. If setup starts inside an existing newspaper view, keep that view and save preferences without calling either open tool. Do not open another panel to show subsequent edits or saves. Be precise: declaring a global/thread entrypoint is not evidence that a particular host has rendered it. If the host does not support native entrypoints, the regular MCP tools and chat workflow remain available; do not claim a sidebar appeared.

Explain that clicking Update newspaper sends a refresh request to the current conversation. The current conversation reads the chosen sources and saves a source-backed edition. It uses that Codex/ChatGPT session and its limits, with no extra model API key. Public-page text enters the current service's conversation; private logged-in content requires explicit user scope. The package does not include browser-history access. Such input requires a separately available browser integration and authorization.

Installing the plugin does not create an automation. Only proceed with a first edition when the user has requested it. See the sibling Morning Tab skill for the editorial workflow. Report the actual connection and host-UI status, not just package creation.
