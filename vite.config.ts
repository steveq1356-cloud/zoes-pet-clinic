import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// The version shown on the title screen. GitHub Actions sets BUILD_NUMBER
// (the workflow run number), so every deploy gets a new version.
const APP_VERSION = process.env.BUILD_NUMBER ? `${pkg.version}-b${process.env.BUILD_NUMBER}` : `${pkg.version}-dev`;

/** Writes dist/version.json so running games can detect a newer deploy. */
function versionFile(): Plugin {
  return {
    name: "zpc-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: APP_VERSION, built: new Date().toISOString() }) + "\n",
      });
    },
  };
}

// GitHub Pages serves the site from /<repo-name>/, so the base path comes from
// the BASE_PATH env var in CI (see .github/workflows/deploy.yml). Locally it's "/".
// Vite already puts a content hash in every JS/asset filename, so a refresh
// always fetches the newest code.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [versionFile()],
  build: { target: "es2020", assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
