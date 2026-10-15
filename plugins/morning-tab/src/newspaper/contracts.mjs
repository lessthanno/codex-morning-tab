import { z } from "zod";
export const SettingsSchema = z
  .object({
    masthead: z.string().trim().min(1).max(80).default("The Morning Tab"),
    language: z.string().trim().min(2).max(35).default("en"),
    timezone: z.string().trim().min(1).max(80).default("UTC"),
    topics: z.string().max(2000).default(""),
    sourceUrls: z.string().max(8000).default(""),
    blockedDomains: z
      .string()
      .max(8000)
      .default("mail.google.com\noutlook.live.com\ndocs.google.com"),
  })
  .strict()
  .superRefine((s, ctx) => {
    try {
      new Intl.DateTimeFormat(s.language, { timeZone: s.timezone });
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Use a valid language tag and IANA timezone.",
      });
    }
    for (const line of lines(s.blockedDomains)) {
      try {
        const h = line.replace(/^\*\./, "");
        if (
          new URL(`https://${h}`).host !== h.toLowerCase() ||
          /[/?#@:]/.test(h)
        )
          throw Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          message: `Invalid excluded domain: ${line}`,
        });
      }
    }
    const urls = lines(s.sourceUrls);
    if (urls.length > 8)
      ctx.addIssue({
        code: "custom",
        message: "Choose at most eight reading sources.",
      });
    for (const url of urls) {
      try {
        safeUrl(url, lines(s.blockedDomains));
      } catch (e) {
        ctx.addIssue({ code: "custom", message: e.message });
      }
    }
  });
export const StorySchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(1200),
    url: z.string().max(2000),
    source: z.string().trim().min(1).max(150),
    readFrom: z.string().max(2000),
    section: z.string().trim().min(1).max(60),
    publishedAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict();
export const EditionSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().max(240).default(""),
    editorNote: z.string().max(1200).default(""),
    stories: z.array(StorySchema).min(1).max(24),
    sources: z
      .array(
        z
          .object({
            url: z.string().max(2000),
            status: z.enum(["read", "failed"]),
            reason: z.string().max(300).default(""),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export const lines = (text) => [
  ...new Set(
    String(text)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
export function safeUrl(value, blocked = []) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw Error("Invalid source URL.");
  }
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (u.protocol !== "https:" || u.username || u.password)
    throw Error(
      "Only public HTTPS URLs without embedded credentials are supported.",
    );
  // Reject IP literals, local names and credential-bearing query strings. No DNS or network requests occur here.
  if (
    !h.includes(".") ||
    h.startsWith("[") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h) ||
    /\.(localhost|local|internal|lan|home\.arpa)$/.test(h)
  )
    throw Error("Local hosts and IP addresses are excluded.");
  if (
    blocked.some((d) => {
      const b = d.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
      return h === b || h.endsWith(`.${b}`);
    })
  )
    throw Error("Source is excluded by your reading preferences.");
  for (const k of u.searchParams.keys())
    if (
      /^(api[-_]?key|access[-_]?token|auth(ori[sz]ation)?|token|password|secret|signature|credential|code)$/i.test(
        k,
      )
    )
      throw Error("Credential-bearing source URLs are excluded.");
  u.hash = "";
  return u.href;
}
export function validateEdition(input, settings) {
  const edition = EditionSchema.parse(input);
  const blocked = lines(settings.blockedDomains);
  const sources = edition.sources.map((s) => ({
    ...s,
    url: safeUrl(s.url, blocked),
  }));
  if (new Set(sources.map((s) => s.url)).size !== sources.length)
    throw Error("Source URLs must be unique.");
  const read = new Set(
    sources.filter((s) => s.status === "read").map((s) => s.url),
  );
  if (!read.size)
    throw Error(
      "No source was read successfully. The previous edition is unchanged.",
    );
  const seen = new Set();
  const stories = [];
  for (const s of edition.stories) {
    const story = {
      ...s,
      url: safeUrl(s.url, blocked),
      readFrom: safeUrl(s.readFrom, blocked),
    };
    if (!read.has(story.readFrom))
      throw Error("Every story must cite a successfully read source.");
    if (!seen.has(story.url)) {
      seen.add(story.url);
      stories.push(story);
    }
  }
  return { ...edition, stories, sources };
}
