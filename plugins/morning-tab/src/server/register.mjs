import { McpServer } from "@modelcontextprotocol/server";
import { createSettings } from "@openai/mcp-extensions/server";
import { z } from "zod";
import {
  EditionSchema,
  SettingsSchema,
  lines,
  safeUrl,
} from "../newspaper/contracts.mjs";
export const APP_URI = "ui://morning-tab/newspaper-v3";
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const mutating = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};
const result = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
});
export function createMorningTabServer({ store, html }) {
  const server = new McpServer({
    name: "morning-tab",
    title: "Morning Tab",
    version: "0.1.2",
  });
  server.registerResource(
    "morning-tab-ui",
    APP_URI,
    { title: "Morning Tab", mimeType: "text/html;profile=mcp-app" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/html;profile=mcp-app",
          text: html,
          _meta: {
            "openai/ui": {
              preferredDisplayMode: "fullscreen",
              availableDisplayModes: ["inline", "fullscreen"],
            },
            ui: {
              prefersBorder: false,
              csp: { connectDomains: [], resourceDomains: [] },
            },
          },
        },
      ],
    }),
  );
  const viewMeta = {
    ui: { resourceUri: APP_URI },
    "openai/ui": { entrypoints: [{ type: "global" }] },
  };
  server.registerTool(
    "morning_tab_open",
    {
      title: "Morning Tab",
      description:
        "Open the newspaper only when the user explicitly asks to open or show it. Do not call after editing, saving, refreshing or publishing: existing views update automatically.",
      inputSchema: z.object({}),
      annotations: readOnly,
      _meta: viewMeta,
    },
    async () => result(await store.read()),
  );
  server.registerTool(
    "morning_tab_open_panel",
    {
      title: "Newspaper beside this chat",
      description:
        "Open a newspaper panel only when explicitly requested by the user. Never open a new panel as part of editing, refreshing or saving an edition.",
      inputSchema: z.object({}),
      annotations: readOnly,
      _meta: {
        ui: { resourceUri: APP_URI },
        "openai/ui": { entrypoints: [{ type: "thread" }] },
      },
    },
    async () => result(await store.read()),
  );
  server.registerTool(
    "morning_tab_get_state",
    {
      title: "Read saved newspaper state",
      description:
        "Read the current newspaper without opening or rendering a new view.",
      inputSchema: z.object({}),
      annotations: readOnly,
      _meta: { ui: { visibility: ["app"] } },
    },
    async () => result(await store.read()),
  );
  server.registerTool(
    "morning_tab_read_plan",
    {
      title: "Read newspaper preferences",
      description:
        "Read current preferences and revision before preparing an edition. This does not read the web or browser history.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => {
      const state = await store.read();
      return result({
        settings: state.settings,
        revision: state.revision,
        previousEdition: state.edition
          ? { id: state.edition.id, createdAt: state.edition.createdAt }
          : null,
      });
    },
  );
  server.registerTool(
    "morning_tab_check_urls",
    {
      title: "Check reading URLs",
      description:
        "Validate candidate URLs against local-host, credential and user exclusion rules before opening them. Performs no network or DNS requests.",
      inputSchema: z.object({ urls: z.array(z.string().max(2000)).max(30) }),
      annotations: readOnly,
    },
    async ({ urls }) => {
      const { settings } = await store.read();
      const allowed = [],
        rejected = [];
      for (const url of urls)
        try {
          allowed.push(safeUrl(url, lines(settings.blockedDomains)));
        } catch (e) {
          rejected.push({ url, reason: e.message });
        }
      return result({ allowed: [...new Set(allowed)], rejected });
    },
  );
  server.registerTool(
    "morning_tab_publish_edition",
    {
      title: "Save prepared newspaper",
      description:
        "Save a fact-checked, source-backed edition locally after reading the chosen sources. Never use for unread, invented, or all-failed source content. expectedRevision must come from the latest read_plan. This is a data-only save: existing newspaper views update automatically. Do not call any open tool afterwards unless the user explicitly requests a new view.",
      inputSchema: z.object({
        edition: EditionSchema,
        expectedRevision: z.number().int().nonnegative(),
      }),
      annotations: mutating,
    },
    async ({ edition, expectedRevision }) =>
      result(await store.publish(edition, expectedRevision)),
  );
  server.registerTool(
    "morning_tab_update_preferences",
    {
      title: "Save reading preferences",
      description:
        "Save user-chosen reading preferences locally. Does not start a refresh or create an automation.",
      inputSchema: z.object({ settings: SettingsSchema }),
      annotations: { ...mutating, idempotentHint: true },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ settings }) => result(await store.updateSettings(settings)),
  );
  const schemas = {
    masthead: z.string().min(1).max(80),
    language: z.string().min(2).max(35),
    timezone: z.string().min(1).max(80),
    topics: z.string().max(2000),
    sourceUrls: z.string().max(8000),
    blockedDomains: z.string().max(8000),
  };
  const titles = {
    masthead: "Newspaper title",
    language: "Language",
    timezone: "Timezone",
    topics: "Reading interests",
    sourceUrls: "Source URLs — one per line, up to eight",
    blockedDomains: "Excluded domains — one per line",
  };
  createSettings(server).register({
    fields: Object.fromEntries(
      Object.entries(schemas).map(([k, schema]) => [
        k,
        { schema, title: titles[k] },
      ]),
    ),
    layout: [
      {
        kind: "group",
        title: "Your newspaper",
        items: ["masthead", "language", "timezone"].map((property) => ({
          kind: "property",
          property,
        })),
      },
      {
        kind: "group",
        title: "Reading preferences",
        items: ["topics", "sourceUrls", "blockedDomains"].map((property) => ({
          kind: "property",
          property,
        })),
      },
    ],
    read: async () => (await store.read()).settings,
    update: async (set) => (await store.updateSettings(set)).settings,
  });
  return server;
}
