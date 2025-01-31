const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const LOG_LEVEL = "info";
const MODULE_BUNDLE_BLOCK_LIST = ["esbuild", "vscode", "./xhr-sync-worker.js"];

// esbuild plugin to Transform VSCode string identifiers like
// configuration or command IDs from the `continue.` namespace
// to the `granite.` namespace to avoid clashes

// Quick-and-not-quite-right replacement for not-yet-common RegExp.escape()
function escapeForRegExp(str) {
  return str.replace(/([.*+?|^$()[\]{}\\])/g, "\\$1");
}

const extensionPath = path.resolve(
  __dirname,
  "../continue/extensions/vscode/src",
);
const extensionFilter = new RegExp(
  "^" + escapeForRegExp(extensionPath) + "/.*\\.ts$",
);

const namespaceSubstitutions = [
  {
    pattern: /^continue[.]/,
    replacement: "granite.",
  },
  {
    pattern: /^Continue[.]continue$/,
    replacement: "redhat.granite-code",
  },
  {
    pattern: /continueGUI/,
    replacement: "graniteGUI",
  },
];

function namespaceTransform(fileContents) {
  // For speed, we do this just as a string replacement, rather than
  // using ts-morph or similar. We only care about simple strings
  // like "continue.acceptDiff", so we can simplify matching
  // strings in the source code.
  return fileContents.replace(/"([^"\\\r\n]+)"/g, (m, strContents) => {
    for (const { pattern, replacement } of namespaceSubstitutions) {
      strContents = strContents.replace(pattern, replacement);
    }
    return '"' + strContents + '"';
  });
}

let namespaceTransformPlugin = {
  name: "example",
  setup(build) {
    build.onLoad(
      {
        filter: extensionFilter,
      },
      async (args) => {
        let text = await fs.promises.readFile(args.path, "utf8");
        return {
          contents: namespaceTransform(text),
          loader: "ts",
        };
      },
    );
  },
};

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
  plugins: [namespaceTransformPlugin],
  platform: "node",

  // Workaround, see: https://github.com/evanw/esbuild/issues/1492#issuecomment-893144483
  inject: ["continue/extensions/vscode/scripts/importMetaUrl.js"],
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
