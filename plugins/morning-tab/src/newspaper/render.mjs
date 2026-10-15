export const escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderPaper({ settings, edition }, { preview = false } = {}) {
  const e = escapeHtml;
  const zh = settings.language.startsWith("zh");
  const words = zh
    ? {
        local: "个人阅读版",
        sources: "阅读来源",
        note: "编者的话",
        read: "已读取",
        failed: "读取失败",
        empty: "你的晨报，从这里开始。",
        emptyBody:
          "先设置你想关注的网站，然后点击“更新晨报”。内容会由当前对话整理，并在这里显示。",
        edition: "内容按来源整理",
        more: "继续阅读",
        updated: "生成于",
        footer: "Morning Tab · 由当前对话编排",
        preview: "公开示例，非个人浏览记录",
      }
    : {
        local: "A personal reading edition",
        sources: "Reading sources",
        note: "Editor's note",
        read: "Read",
        failed: "Read failed",
        empty: "Your next edition starts here.",
        emptyBody:
          "Choose your reading sources, then select Update newspaper. Your current conversation will prepare the edition and display it here.",
        edition: "Edited from your sources",
        more: "More worth reading",
        updated: "Prepared",
        footer: "Morning Tab · Edited in your conversation",
        preview: "Public example · not personal browsing data",
      };
  const header = `<div class="utility"><span>${e(words.local)}</span><span>${e(preview ? words.preview : words.edition)}</span></div><h1 class="masthead">${e(settings.masthead)}</h1><p class="tagline">${e(edition?.subtitle || "Your corner of the internet, thoughtfully edited.")}</p>`;
  if (!edition)
    return `<div class="paper">${header}<section class="empty"><h2>${e(words.empty)}</h2><p>${e(words.emptyBody)}</p></section></div>`;
  const date = new Intl.DateTimeFormat(settings.language, {
    dateStyle: "full",
    timeZone: settings.timezone,
  }).format(new Date(edition.createdAt));
  const byline = (s) =>
    `<p class="byline">${e(s.source)}${s.publishedAt ? ` · <time datetime="${e(s.publishedAt)}">${e(new Intl.DateTimeFormat(settings.language, { dateStyle: "medium", timeZone: settings.timezone }).format(new Date(s.publishedAt)))}</time>` : ""}</p>`;
  const article = (s, lead = false) =>
    `<article${lead ? ' class="lead"' : ""}><p class="eyebrow">${e(s.section)}</p><h2><a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${e(s.title)}</a></h2><p class="${lead ? "lead-summary" : "story-summary"}">${e(s.summary)}</p>${byline(s)}</article>`;
  const success = edition.sources.filter((s) => s.status === "read").length;
  const sourceList = `<section><h2>${e(words.sources)}</h2><ul class="source-list">${edition.sources.map((s) => `<li><a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${e(new URL(s.url).hostname)}</a><span class="source-state ${s.status === "failed" ? "source-failed" : ""}">${e(s.status === "read" ? words.read : words.failed)}${s.status === "failed" && s.reason ? ` · ${e(s.reason)}` : ""}</span></li>`).join("")}</ul></section>`;
  return `<div class="paper">${header}<div class="edition-meta"><span>${e(words.updated)} <time datetime="${e(edition.createdAt)}">${e(date)}</time></span><span>${edition.stories.length} ${zh ? "篇选读" : "selected stories"} · ${success} ${zh ? "个已读来源" : "sources read"}</span></div><div class="front">${article(edition.stories[0], true)}<div class="support">${edition.stories
    .slice(1, 3)
    .map((s) => article(s))
    .join(
      "",
    )}</div><aside class="sidebar">${edition.editorNote ? `<section><h2>${e(words.note)}</h2><p>${e(edition.editorNote)}</p></section>` : ""}${sourceList}</aside></div>${
    edition.stories.length > 3
      ? `<h2 class="brief-summary">${e(words.more)}</h2><section class="more-stories">${edition.stories
          .slice(3)
          .map((s) => article(s))
          .join("")}</section>`
      : ""
  }<footer><span>${e(words.footer)}</span><span>${e(settings.timezone)}</span></footer></div>`;
}
