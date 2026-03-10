import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(rootDir, "dist");

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [resolve(rootDir, "src/index.ts")],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: "iife",
  globalName: "FlakersStudioWidgetBundle",
  target: ["es2020"],
  outfile: resolve(outdir, "flakers-widget.js"),
  banner: {
    js: "/* Flakers Studio Widget */",
  },
});
