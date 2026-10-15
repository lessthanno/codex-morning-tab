import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const dir = "plugins/morning-tab/dist";
await mkdir(dir, { recursive: true });
const app = await build({
  entryPoints: ["plugins/morning-tab/src/app/MorningTab.mjs"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  minify: true,
  outfile: "app.js",
});
const js = app.outputFiles
  .find((f) => f.path.endsWith(".js"))
  .text.replaceAll("</script", "<\\/script");
const css = app.outputFiles.find((f) => f.path.endsWith(".css")).text;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Morning Tab</title><style>${css}</style></head><body><nav class="app-toolbar" aria-label="Newspaper actions"><span class="app-label">Morning Tab</span><div class="toolbar-actions"><button id="preferences">Preferences</button><button id="refresh" class="primary" disabled>Update newspaper</button></div></nav><p id="status" class="app-status" role="status" aria-live="polite"></p><main id="paper"><p class="loading">Opening your newspaper…</p></main><dialog id="preferences-dialog" class="preferences" aria-labelledby="preferences-title"><form id="preferences-form"></form></dialog><script type="module">${js}</script></body></html>`;
await writeFile(`${dir}/app.html`, html);
await build({
  entryPoints: ["plugins/morning-tab/src/server/index.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: `${dir}/server.mjs`,
  minify: true,
  banner: {
    js: "import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);",
  },
});
console.log("Built self-contained local MCP server and app UI.");
// Carry the licenses of bundled runtime dependencies with the prebuilt distribution.
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const licenseParts = [];
for (const [location, meta] of Object.entries(lock.packages)) {
  if (!location || meta.dev || location.includes("esbuild")) continue;
  const name = location.replace(/^.*node_modules\//, "");
  let license = "";
  for (const candidate of [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "license",
    "license.md",
    "license.txt",
    "License",
    "License.md",
  ])
    try {
      license = await readFile(`${location}/${candidate}`, "utf8");
      break;
    } catch {}
  if (!license && name === "@cfworker/json-schema")
    license = await readFile("third-party/cfworker.LICENSE", "utf8");
  if (license)
    licenseParts.push(
      `${name} ${meta.version}\n${meta.license || ""}\n\n${license}`,
    );
  else throw Error(`Missing runtime dependency license: ${name}`);
  for (const candidate of ["NOTICE", "NOTICE.md", "NOTICE.txt"])
    try {
      licenseParts.push(
        `${name} NOTICE\n\n${await readFile(`${location}/${candidate}`, "utf8")}`,
      );
    } catch {}
}
await writeFile(
  `${dir}/THIRD-PARTY-LICENSES.txt`,
  licenseParts.join("\n\n" + "=".repeat(72) + "\n\n"),
);
