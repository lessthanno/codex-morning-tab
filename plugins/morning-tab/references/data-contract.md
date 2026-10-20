# Tool contract

`morning_tab_read_plan` returns `settings`, `revision`, and optional previous-edition metadata. The server stores state in `MORNING_TAB_DATA_DIR`, or `~/.local/share/codex-morning-tab` by default. Do not edit installed plugin files to save personal state.

Settings are primitive strings for compatibility with native plugin settings:

```json
{
  "masthead": "The Morning Tab",
  "language": "en",
  "timezone": "UTC",
  "topics": "Open-source software, AI engineering",
  "sourceUrls": "https://github.com/ThariqS/ai-newtab\nhttps://developers.openai.com/plugins/build/extensions",
  "blockedDomains": "mail.google.com\noutlook.live.com\ndocs.google.com"
}
```

`sourceUrls` and `blockedDomains` use one value per line. A configured URL is not proof that a page was read. `morning_tab_check_urls` accepts `{urls: string[]}` and returns `allowed` and `rejected` arrays. It checks URL syntax, credential fields, local/IP addresses, and domain exclusions, not DNS or retrieval permissions.

`morning_tab_publish_edition` accepts:

```json
{
  "expectedRevision": 0,
  "edition": {
    "title": "A calmer way to follow software",
    "subtitle": "A personal reading edition",
    "editorNote": "An editorial interpretation of the selected material.",
    "stories": [
      {
        "title": "An AI-written new-tab page",
        "summary": "The project describes an extension that builds a personal homepage from browsing activity.",
        "url": "https://github.com/ThariqS/ai-newtab",
        "source": "ThariqS / GitHub",
        "readFrom": "https://github.com/ThariqS/ai-newtab",
        "section": "Software",
        "publishedAt": null
      }
    ],
    "sources": [
      {
        "url": "https://github.com/ThariqS/ai-newtab",
        "status": "read",
        "reason": ""
      }
    ]
  }
}
```

- `stories`: 1–24 entries. The first story is the lead. Duplicate destination URLs are collapsed. `readFrom` must match a source with `status: "read"` after URL normalization.
- `sources`: 1–8 unique URLs. `status` is `read` or `failed`. For failures, include a brief reason, never credentials or private response bodies.
- `publishedAt`: a source-backed ISO timestamp or null. The server supplies the edition's real `createdAt` and `id`.
- Every destination must have been observed in its source. The server checks safe URLs and provenance references; the authoring conversation must verify that the links and summaries are actually supported.
- All editorial content is plain text. HTML is escaped; no model-written code, images, remote fonts or trackers execute in the newspaper.
- Revisions protect against settings/edition changes while a refresh is in progress. Failed validation or conflicts leave the previous edition intact.

`morning_tab_open` accepts `{}` and exposes the global newspaper entrypoint. `morning_tab_open_panel` is the separate, explicitly requested conversation-panel entrypoint. `morning_tab_get_state` is an app-only, data-only read; it has no UI resource. `morning_tab_publish_edition` also has no UI resource and must not trigger a new view. Existing views poll saved revisions while visible, including for ordinary conversation edits, and refresh in place. Only explicitly requested open/show actions use the open tools. The UI uses `@openai/mcp-extensions/app` to send a user-initiated update request to the active conversation, with standard MCP Apps messaging as a fallback. Reading and writing remain explicit tools. There is no autonomous schedule or built-in browser-history reader.
