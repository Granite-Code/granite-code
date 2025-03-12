const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const LOG_LEVEL = "info";
const MODULE_BUNDLE_BLOCK_LIST = [
  "esbuild",
  "vscode",
  "./xhr-sync-worker.js",
  "onnxruntime-node",
  "win-ca",
];

// esbuild plugin to Transform VSCode string identifiers like
// configuration or command IDs from the `continue.` namespace
// to the `granite.` namespace to avoid clashes

// Quick-and-not-quite-right replacement for not-yet-common RegExp.escape()
function escapeForRegExp(str) {
  return str.replace(/[|\\*?+$^.{}()\[\]]/g, "\\$&");
}

const makeTransformPlugin = ({ name, basePath, substitutions }) => {
  const absPath = path.resolve(__dirname, "..", basePath);
  const filter = new RegExp(
    "^" + escapeForRegExp(absPath + path.sep) + ".*\\.ts$",
  );

  const transform = (fileContents) => {
    // For speed, we do this just as a string replacement, rather than
    // using ts-morph or similar. We only care about simple strings
    // like "continue.acceptDiff", so we can simplify matching
    // strings in the source code.
    return fileContents.replace(/"([^"\\\r\n]+)"/g, (m, strContents) => {
      for (const { pattern, replacement } of substitutions) {
        strContents = strContents.replace(pattern, replacement);
      }
      return '"' + strContents + '"';
    });
  };

  return {
    name: name,
    setup(build) {
      build.onLoad(
        {
          filter: filter,
        },
        async (args) => {
          const text = await fs.promises.readFile(args.path, "utf8");
          return {
            contents: transform(text),
            loader: "ts",
          };
        },
      );
    },
  };
};

const namespaceTransformPlugin = makeTransformPlugin({
  name: "granite-namespace-transform",
  basePath: "continue/extensions/vscode/src",
  substitutions: [
    {
      pattern: /^continue[.]/,
      replacement: "granite.",
    },
    {
      pattern: /^Continue[.]continue$/,
      replacement: "redhat.granitecode",
    },
    {
      pattern: /continueGUI/,
      replacement: "graniteGUI",
    },
  ],
});

const controlPlaneTransformPlugin = makeTransformPlugin({
  name: "granite-control-plane-transform",
  basePath: "continue/core/control-plane",
  substitutions: [
    // This among other things, transforms EXTENSION_NAME
    {
      pattern: /^continue$/,
      replacement: "granite",
    },
    // This doesn't matter but, transform to match "continue"
    {
      pattern: /^continue-staging$/,
      replacement: "granite-staging",
    },
    // These make sure we we don't make API calls to continue.dev
    // or their SaaS providers
    {
      pattern: /continue[.]dev/,
      replacement: "example.com",
    },
    {
      pattern: /[.]run[.]app/,
      replacement: ".example.com",
    },
    {
      pattern: /[.]workos[.]com/,
      replacement: ".example.com",
    },
  ],
});

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
  plugins: [namespaceTransformPlugin, controlPlaneTransformPlugin],
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
