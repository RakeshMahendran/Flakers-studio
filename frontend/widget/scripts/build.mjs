import { build } from "esbuild";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(rootDir, "dist");
const entry = resolve(rootDir, "src/index.ts");

// Bundle size budget (gzipped). The task spec is <50kb gzipped.
const SIZE_BUDGET_GZIP = 50 * 1024;

await mkdir(outdir, { recursive: true });

// IIFE — the script-tag drop-in. `globalName` is set so the IIFE wrapper
// produces a stable global; the entry then assigns
// `window.FlakersStudioWidget` itself for ergonomic access.
await build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: "iife",
  globalName: "FlakersStudioWidgetBundle",
  target: ["es2020"],
  outfile: resolve(outdir, "flakers-widget.iife.js"),
  legalComments: "none",
  banner: { js: "/* FlakersStudio Widget — IIFE bundle */" },
});

// ESM — for bundler consumers (`import { FlakersStudioWidget } from ...`).
await build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: "esm",
  target: ["es2020"],
  outfile: resolve(outdir, "flakers-widget.js"),
  legalComments: "none",
  banner: { js: "/* FlakersStudio Widget — ESM bundle */" },
});

const targets = [
  "flakers-widget.iife.js",
  "flakers-widget.js",
];

console.log("");
console.log("FlakersStudio widget — build report");
console.log("===================================");

let exceeded = false;
const report = {};
for (const file of targets) {
  const path = resolve(outdir, file);
  const buf = await readFile(path);
  const gz = gzipSync(buf, { level: 9 });
  const size = buf.byteLength;
  const gzip = gz.byteLength;
  report[file] = { rawBytes: size, gzipBytes: gzip };
  const flag = gzip > SIZE_BUDGET_GZIP ? " ❌ OVER BUDGET" : " ✓";
  console.log(
    `  ${file.padEnd(28)} raw=${size.toString().padStart(6)}B  gz=${gzip
      .toString()
      .padStart(6)}B (${(gzip / 1024).toFixed(2)} kB / ${(SIZE_BUDGET_GZIP / 1024).toFixed(0)} kB budget)${flag}`,
  );
  if (gzip > SIZE_BUDGET_GZIP) exceeded = true;
}

// Persist the report so CI / dashboards can consume it.
await writeFile(
  resolve(outdir, "size-report.json"),
  JSON.stringify(
    { budgetBytesGzip: SIZE_BUDGET_GZIP, files: report, generatedAt: new Date().toISOString() },
    null,
    2,
  ),
  "utf-8",
);

if (exceeded) {
  console.error("");
  console.error(`Bundle exceeds ${(SIZE_BUDGET_GZIP / 1024).toFixed(0)} kB gzipped budget — failing build.`);
  process.exit(1);
}

console.log("");
console.log(`All bundles under ${(SIZE_BUDGET_GZIP / 1024).toFixed(0)} kB gzipped budget.`);
