// Builds FLOWSTATE for Vercel using the Build Output API (v3):
//   .vercel/output/static/                    the client (same bundle as dist/)
//   .vercel/output/functions/api/<name>.func  one Node function per AI endpoint
//   .vercel/output/config.json                security headers
// Vercel picks this folder up automatically after `npm run build:vercel`.
import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const OUT = ".vercel/output";
await rm(OUT, { recursive: true, force: true });

// 1) Client — reuse the normal build.
execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
await mkdir(`${OUT}/static`, { recursive: true });
await cp("dist", `${OUT}/static`, { recursive: true, filter: (src) => !src.endsWith(".map") && !/flowstate-(standalone|preview)\.html$/.test(src) });

// 2) Functions — one self-contained bundle each (zod + domain layer inlined).
const routes = { health: "health", "ai/status": "ai-status", recommendations: "recommendations", extract: "extract" };
for (const [path, route] of Object.entries(routes)) {
  const dir = `${OUT}/functions/api/${path}.func`;
  await mkdir(dir, { recursive: true });
  await build({
    stdin: { contents: `import { makeHandler } from "./server/vercel.ts"; export default makeHandler(${JSON.stringify(route)});`, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: `${dir}/index.mjs`,
    logLevel: "warning",
  });
  await writeFile(`${dir}/package.json`, JSON.stringify({ type: "module" }));
  await writeFile(
    `${dir}/.vc-config.json`,
    JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60, regions: ["fra1"] }, null, 2),
  );
}

// 3) Routing + security headers (same policy as the Node server).
const headers = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
await writeFile(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/(.*)", headers, continue: true },
        { handle: "filesystem" },
      ],
    },
    null,
    2,
  ),
);
console.log(`Vercel output written to ${OUT}`);
