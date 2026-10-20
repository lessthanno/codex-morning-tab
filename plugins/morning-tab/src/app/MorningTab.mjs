import { createStateSync } from "./state-sync.mjs";
import { App } from "@modelcontextprotocol/ext-apps";
import { OpenAIExtensions } from "@openai/mcp-extensions/app";
import { renderPaper, escapeHtml } from "../newspaper/render.mjs";
import { SettingsSchema } from "../newspaper/contracts.mjs";
import demo from "../../../../examples/edition.json";
import "./MorningTab.css";
const preview = window.parent === window;
const app = new App({ name: "morning-tab", version: "0.1.2" });
const extensions = new OpenAIExtensions(app);
let state = null;
let waitingFor = null;
let pollUntil = 0;
let connected = false;
let inFlight = false;
let refreshing = false;
let noticeKind = "";
const paper = document.getElementById("paper");
const status = document.getElementById("status");
const refresh = document.getElementById("refresh");
const preferences = document.getElementById("preferences");
const dialog = document.getElementById("preferences-dialog");
const form = document.getElementById("preferences-form");
const zh = () => state?.settings.language.startsWith("zh");
const readableError = (e) =>
  e.issues
    ?.map((i) => i.message)
    .slice(0, 2)
    .join(" ") ||
  e.message ||
  String(e);
function notice(text, error = false, kind = "general") {
  noticeKind = text ? kind : "";
  status.textContent = text;
  status.classList.toggle("error", error);
}
const waitingNotice = () =>
  zh()
    ? "已请求当前对话更新。整理完成后会显示在这里，上一版仍可阅读。"
    : "Refresh requested in this conversation. Your previous edition remains readable while it is prepared.";
function expireRefresh() {
  if (!waitingFor || Date.now() <= pollUntil) return false;
  waitingFor = null;
  refresh.disabled = !connected;
  notice(
    zh()
      ? "暂未收到新版本，请查看当前对话中的进度或错误。"
      : "No new edition received yet. Check this conversation for progress or errors.",
  );
  return true;
}
function render(next) {
  if (!next?.settings) return;
  const changed =
    !state ||
    state.revision !== next.revision ||
    state.edition?.id !== next.edition?.id;
  state = next;
  if (changed) {
    // Preserve the current reading view; unchanged polls must not replace its DOM or reset selection.
    paper.innerHTML = renderPaper(state, { preview });
    if (connected)
      void app
        .updateModelContext({
          structuredContent: {
            app: "morning-tab",
            view: "newspaper",
            revision: state.revision,
            editionId: state.edition?.id ?? null,
            displayPolicy:
              "Update this existing newspaper view in place. Do not call an open tool after a normal edit or refresh.",
          },
        })
        .catch(() => {});
  }
  refresh.textContent = zh() ? "更新晨报" : "Update newspaper";
  preferences.textContent = zh() ? "阅读偏好" : "Preferences";
  document.documentElement.lang = state.settings.language;
  if (
    waitingFor &&
    state.edition &&
    state.edition.id !== waitingFor.editionId
  ) {
    waitingFor = null;
    notice(zh() ? "新一期晨报已准备好。" : "Your new edition is ready.");
    refresh.disabled = !connected;
  }
}
async function readState() {
  const result = await app.callServerTool(
    { name: "morning_tab_get_state", arguments: {} },
    { timeout: 15_000 },
  );
  if (result.isError)
    throw Error(
      result.content?.find((c) => c.type === "text")?.text ||
        "Unable to read the newspaper.",
    );
  if (!result.structuredContent?.settings)
    throw Error("The host returned an incomplete newspaper state.");
  return result.structuredContent;
}
const stateSync = createStateSync({
  readState,
  isVisible: () => !document.hidden,
  onState(next) {
    render(next);
    if (expireRefresh()) return;
    if (noticeKind === "connection")
      notice(waitingFor ? waitingNotice() : "");
  },
  onError() {
    if (expireRefresh()) return;
    notice(
      state?.edition
        ? zh()
          ? "连接暂时中断，正在自动重试；上一版晨报已保留。"
          : "Connection interrupted. Retrying automatically; your previous edition is kept."
        : zh()
          ? "暂时无法加载晨报，正在自动重试。"
          : "Unable to load the newspaper yet. Retrying automatically.",
      true,
      "connection",
    );
  },
});
const onVisibility = () => stateSync.request();
document.addEventListener("visibilitychange", onVisibility);
refresh.addEventListener("click", async () => {
  if (!connected || refreshing) return;
  refreshing = true;
  refresh.disabled = true;
  const previousId = state?.edition?.id ?? null;
  try {
    const message = {
      role: "user",
      content: [
        {
          type: "text",
          text: "Use the Morning Tab plugin to prepare a fresh personal newspaper. Read morning_tab_read_plan, use my configured sources and exclusions, read the public pages with available web tools, and save a source-backed edition with morning_tab_publish_edition using the current revision. Update the existing newspaper view in place. Do not call morning_tab_open or morning_tab_open_panel after saving, do not open a browser preview, and do not create another chat or panel. Keep the old edition if reads fail. Do not access private browser history or signed-in private content without my separate authorization.",
        },
      ],
    };
    let result;
    if (extensions.message)
      result = await extensions.message.send({
        ...message,
        _meta: { "openai/message": { target: "active", send: true } },
      });
    else result = await app.sendMessage(message);
    if (result?.isError)
      throw Error("The host did not accept the refresh request.");
    if (state?.edition?.id && state.edition.id !== previousId) {
      refresh.disabled = false;
      return;
    }
    waitingFor = { editionId: previousId };
    pollUntil = Date.now() + 10 * 60_000;
    notice(waitingNotice());
    stateSync.request();
  } catch (e) {
    notice(
      `${zh() ? "无法发起更新，请在当前对话输入“更新我的晨报”。" : "Could not start a refresh. Ask this conversation to update your Morning Tab."} ${e.message}`,
      true,
    );
    refresh.disabled = false;
  } finally {
    refreshing = false;
  }
});
preferences.addEventListener("click", () => {
  if (!state) return;
  const e = escapeHtml;
  const fields = zh()
    ? {
        masthead: "报头名称",
        language: "语言",
        timezone: "时区",
        topics: "阅读兴趣",
        sourceUrls: "阅读来源（每行一个 HTTPS 地址，最多八个）",
        blockedDomains: "排除网站（每行一个域名）",
      }
    : {
        masthead: "Newspaper title",
        language: "Language",
        timezone: "Timezone",
        topics: "Reading interests",
        sourceUrls: "Source URLs (one HTTPS URL per line, up to eight)",
        blockedDomains: "Excluded domains (one per line)",
      };
  form.innerHTML = `<h2 id="preferences-title">${zh() ? "阅读偏好" : "Reading preferences"}</h2><p>${zh() ? "偏好保存在本机。保存后点击“更新晨报”，由当前对话重新整理。网页内容会进入当前 Codex 对话。" : "Preferences stay on this computer. Save, then select Update newspaper to prepare a new edition in this conversation. Retrieved pages become part of your current Codex conversation."}</p>${Object.entries(
    fields,
  )
    .map(
      ([key, label]) =>
        `<label>${e(label)}${["topics", "sourceUrls", "blockedDomains"].includes(key) ? `<textarea name="${key}" maxlength="8000">${e(state.settings[key])}</textarea>` : `<input name="${key}" value="${e(state.settings[key])}" required maxlength="80">`}</label>`,
    )
    .join(
      "",
    )}<p id="preferences-error" role="alert"></p><div class="preference-actions"><button type="button" id="cancel-preferences">${zh() ? "取消" : "Cancel"}</button><button type="submit" class="primary" ${preview ? "disabled" : ""}>${zh() ? "保存偏好" : "Save preferences"}</button></div>`;
  form
    .querySelector("#cancel-preferences")
    .addEventListener("click", () => dialog.close());
  dialog.showModal();
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (preview || inFlight) return;
  inFlight = true;
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const settings = Object.fromEntries(new FormData(form));
    SettingsSchema.parse(settings);
    const result = await app.callServerTool({
      name: "morning_tab_update_preferences",
      arguments: { settings },
    });
    if (result.isError)
      throw Error(
        result.content?.find((c) => c.type === "text")?.text ||
          "Unable to save preferences.",
      );
    render(result.structuredContent);
    dialog.close();
    notice(
      zh()
        ? "偏好已保存。点击更新晨报以应用到下一版。"
        : "Preferences saved. Update the newspaper to apply them to the next edition.",
    );
  } catch (e) {
    form.querySelector("#preferences-error").textContent = readableError(e);
  } finally {
    inFlight = false;
    button.disabled = false;
  }
});
document.addEventListener("click", async (e) => {
  const a = e.target.closest?.("a");
  if (!a || preview) return;
  e.preventDefault();
  try {
    const result = await app.openLink({ url: a.href });
    if (result?.isError) throw Error("Host declined to open the link.");
  } catch (err) {
    notice(
      `${zh() ? "无法打开链接：" : "Could not open link: "}${a.href} — ${err.message}`,
      true,
    );
  }
});
app.ontoolresult = (result) => {
  if (!result.isError && result.structuredContent?.settings)
    render(result.structuredContent);
};
app.onteardown = async () => {
  stateSync.stop();
  document.removeEventListener("visibilitychange", onVisibility);
  return {};
};
if (preview) {
  const settings = SettingsSchema.parse({ language: "en", timezone: "UTC" });
  render({
    settings,
    edition: {
      ...demo,
      id: "public-example",
      createdAt: "2026-10-15T02:00:00Z",
    },
    revision: 0,
  });
  refresh.disabled = true;
  notice(
    "Public example — native MCP host connection is not active in this browser preview.",
  );
} else {
  try {
    await app.connect();
    connected = true;
    refresh.disabled = false;
    // The first read needs the same retry path as later polls. A transient
    // server failure must not permanently disable this already-connected view.
    stateSync.start();
    notice("");
  } catch (e) {
    paper.innerHTML =
      '<div class="empty"><h2>Morning Tab</h2><p>The MCP host connection could not be established. Reopen the plugin panel or check the server connection.</p></div>';
    notice(e.message, true);
    refresh.disabled = true;
  }
}
