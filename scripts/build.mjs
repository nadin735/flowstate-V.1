// Bundles the React client with esbuild.
//   node scripts/build.mjs            → dist/ (index.html + app.js) served by the FLOWSTATE server
//   node scripts/build.mjs --single   → dist/flowstate-standalone.html (one self-contained file, browser storage)
import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile, cp } from "node:fs/promises";

const single = process.argv.includes("--single");
const watch = process.argv.includes("--watch");
const common = {
  entryPoints: ["src/ui/main.tsx"],
  bundle: true,
  format: "esm",
  target: "es2020",
  jsx: "automatic",
  loader: { ".css": "text", ".pdf": "binary" },
  define: { "process.env.NODE_ENV": '"production"', __DEMO__: "false" },
  minify: !watch,
  legalComments: "none",
  logLevel: "info",
};

await mkdir("dist", { recursive: true });
if (single) {
  const template = await readFile("public/index.html", "utf8");
  // The single-file build has no fonts folder next to it: embed the self-hosted fonts.
  let inlinedFonts = template;
  for (const m of template.matchAll(/url\("fonts\/([^"]+)"\)/g)) {
    const b64 = (await readFile(`public/fonts/${m[1]}`)).toString("base64");
    inlinedFonts = inlinedFonts.replace(m[0], `url("data:font/woff;base64,${b64}")`);
  }
  const inline = async (restricted) => {
    const out = await build({ ...common, write: false, define: { ...common.define, __RESTRICTED_HOST__: String(restricted) } });
    const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
    return inlinedFonts.replace('<script type="module" src="/app.js"></script>', () => `<script type="module">${js}</script>`);
  };
  // 1) Full single-file app: open locally in any browser (localStorage persistence, print works).
  const html = await inline(false);
  await writeFile("dist/flowstate-standalone.html", html);
  console.log("dist/flowstate-standalone.html", (html.length / 1024).toFixed(0), "KB");
  // 2) Body-only variant for hosted previews that supply their own document skeleton and block print/downloads.
  const hosted = await inline(true);
  const fragment = hosted
    .replace(/^[\s\S]*?<head>/, "")
    .replace(/<\/head>\s*<body>/, "")
    .replace(/<\/body>\s*<\/html>\s*$/, "")
    .replace(/<meta charset="utf-8" \/>\s*/, "")
    .replace(/<meta name="viewport"[^>]*\/>\s*/, "");
  await writeFile("dist/flowstate-preview.html", fragment);

  // 3) Multi-file hosted variant (page + app.js + lazy chunks) for hosts that limit page size.
  await mkdir("dist-hosted", { recursive: true });
  await build({ ...common, outdir: "dist-hosted", entryNames: "app", chunkNames: "chunks/[name]-[hash]", splitting: true, define: { ...common.define, __RESTRICTED_HOST__: "true" } });
  const page = template
    .replace(/^[\s\S]*?<head>/, "")
    .replace(/<\/head>\s*<body>/, "")
    .replace(/<\/body>\s*<\/html>\s*$/, "")
    .replace(/<meta charset="utf-8" \/>\s*/, "")
    .replace(/<meta name="viewport"[^>]*\/>\s*/, "")
    .replace('src="/app.js"', 'src="app.js"');
  await writeFile("dist-hosted/index.html", page);

  // 4) Demo variants: open directly with the fictional test-data project.
  const demoJs = (await build({ ...common, write: false, define: { ...common.define, __RESTRICTED_HOST__: "false", __DEMO__: "true" } })).outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const demoHtml = inlinedFonts.replace("<title>FLOWSTATE</title>", "<title>FLOWSTATE · Demo</title>").replace('<script type="module" src="/app.js"></script>', () => `<script type="module">${demoJs}</script>`);
  await writeFile("dist/flowstate-demo.html", demoHtml);
  console.log("dist/flowstate-demo.html", (demoHtml.length / 1024).toFixed(0), "KB");
  await mkdir("dist-demo", { recursive: true });
  await build({ ...common, outdir: "dist-demo", entryNames: "app", chunkNames: "chunks/[name]-[hash]", splitting: true, define: { ...common.define, __RESTRICTED_HOST__: "true", __DEMO__: "true" } });
  await writeFile("dist-demo/index.html", page.replace("<title>FLOWSTATE</title>", "<title>FLOWSTATE · Demo</title>"));
  await cp("public/fonts", "dist-demo/fonts", { recursive: true });
  await cp("public/fonts", "dist-hosted/fonts", { recursive: true });
} else {
  // Code splitting keeps PDF.js and the demo scan out of the initial download.
  await build({ ...common, outdir: "dist", entryNames: "app", chunkNames: "chunks/[name]-[hash]", splitting: true, sourcemap: true, define: { ...common.define, __RESTRICTED_HOST__: "false" } });
  await copyFile("public/index.html", "dist/index.html");
  await cp("public/fonts", "dist/fonts", { recursive: true });
  await copyFile("public/og.png", "dist/og.png");
  await cp("public/video", "dist/video", { recursive: true }).catch(() => {});
  await copyFile("THIRD_PARTY_NOTICES.txt", "dist/third-party-notices.txt");
}

// Server bundle: a single Node ESM file (zod and the domain layer inlined) so it runs with plain `node`.
if (!single) {
  await build({
    entryPoints: ["server/server.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: "dist-server/server.mjs",
    logLevel: "info",
  });
}
