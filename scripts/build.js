const esbuild = require("esbuild");

const LOG_LEVEL = "info";
const MODULE_BUNDLE_BLOCK_LIST = ["esbuild", "vscode", "./xhr-sync-worker.js"];

const buildConfig = {
  entryPoints: ["./extension.ts"],
  bundle: true,
  external: MODULE_BUNDLE_BLOCK_LIST,
  format: "cjs",
  logLevel: LOG_LEVEL,
  minify: false,
  sourcemap: true,
  sourcesContent: true,
  outfile: "./out/index.js",
  nodePaths: [
    "./continue/gui/node_modules",
    "./continue/extensions/vscode/node_modules",
    "./continue/core/node_modules",
    "./node-modules",
    "./core",
    "./gui",
    "./extension",
  ],
  platform: "node",

  // Workaround, see: https://github.com/evanw/esbuild/issues/1492#issuecomment-893144483
  inject: ["extension/importMetaUrl.js"],
  define: { "import.meta.url": "importMetaUrl" },
};

async function main() {
  const buildContext = await esbuild.context(buildConfig);
  await buildContext.rebuild();
  await buildContext.dispose();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
