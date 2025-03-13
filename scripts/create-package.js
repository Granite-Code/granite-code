// Adapted from continue/extensions/vscode/scripts/package.js
// Apache 2.0 © 2023-2024 Continue Dev, Inc.

const fs = require("fs").promises;
const path = require("path");
const {
  NPM,
  NPX,
  runCommand,
  findCommonPathRoot,
  expandTemplate,
} = require("./utils.js");
const { glob } = require("glob");
const { minimatch } = require("minimatch");

const projectRoot = path.resolve(__dirname, "..");

const packageConfiguration = {
  entries: [
    {
      description: "Sidebar UI assets",
      inputFiles: ["continue/gui/dist/**/*"],
      outputDir: "gui/",
      exclusions: ["**/jetbrains*"],
    },
    {
      description: "Extension assets",
      inputFiles: ["continue/extensions/vscode/media/*"],
      outputDir: "media/",
    },
    {
      description: "Tree-sitter language tagging query files",
      inputFiles: ["continue/extensions/vscode/tag-qry/*.scm"],
      outputDir: "tag-qry/",
    },
    {
      description: "Web Tree-sitter WebAssembly library",
      inputFiles: [
        "continue/core/node_modules/web-tree-sitter/tree-sitter.wasm",
      ],
      outputDir: "out/",
    },
    {
      description: "Tree-sitter WebAssembly language libraries",
      inputFiles: ["continue/core/node_modules/tree-sitter-wasms/out/*"],
      outputDir: "out/tree-sitter-wasms/",
    },
    {
      description: "Tree-sitter language structural query files",
      inputFiles: ["continue/extensions/vscode/tree-sitter/**/*.scm"],
      outputDir: "tree-sitter/",
    },
    {
      description: "TextMate language syntax grammar files",
      inputFiles: [
        "continue/extensions/vscode/textmate-syntaxes/*.{tmLanguage,json,plist}",
      ],
      outputDir: "textmate-syntaxes/",
    },
    {
      description: "Ollama launcher script",
      inputFiles: ["continue/core/util/start_ollama.sh"],
      platforms: ["linux-*"],
    },
    {
      description: "Tutorial file",
      inputFiles: ["continue/extensions/vscode/continue_tutorial.py"],
    },
    {
      description: "x86-64 Linux binary libraries for reading ONNX files",
      inputFiles: [
        "continue/core/node_modules/onnxruntime-node/bin/napi-v3/linux/x64/*",
      ],
      outputDir: "bin/napi-v3/linux/x64/",
      platforms: ["linux-x64", "alpine-x64"],
    },
    {
      description: "x86-64 Windows binary libraries for reading ONNX files",
      inputFiles: [
        "continue/core/node_modules/onnxruntime-node/bin/napi-v3/win32/x64/*",
      ],
      outputDir: "bin/napi-v3/win32/x64/",
      platforms: ["win32-x64"],
    },
    {
      description: "arm64 Windows binary libraries for reading ONNX files",
      inputFiles: [
        "continue/core/node_modules/onnxruntime-node/bin/napi-v3/win32/arm64/*",
      ],
      outputDir: "bin/napi-v3/win32/arm64",
      platforms: ["win32-arm64"],
    },
    {
      description: "arm64 macOS binary libraries for reading ONNX files",
      inputFiles: [
        "continue/core/node_modules/onnxruntime-node/bin/napi-v3/darwin/arm64/*",
      ],
      outputDir: "bin/napi-v3/darwin/arm64/",
      platforms: ["darwin-arm64"],
    },
    {
      description: "Vector database binary libraries for {os} ({arch})",
      inputFiles: [
        "package-dependencies/{package_dependencies_platform}/node_modules/@lancedb/**/*",
      ],
      outputDir: "out/node_modules/@lancedb",
    },
    {
      description: "workerpool module dependency for tokenizers",
      inputFiles: ["package-dependencies/noarch/node_modules/workerpool/**/*"],
      outputDir: "out/node_modules/workerpool",
    },
    {
      description:
        "SQLite3 binary libraries for {os} ({arch}) in platform-independent directory",
      inputFiles: [
        "package-dependencies/{package_dependencies_platform}/node_modules/sqlite3/build/Release/node_sqlite3.node",
      ],
      outputDir: "out/build/Release",
    },
    {
      description:
        "Binaries for accessing system Certificate Authority on Windows ({arch})",
      inputFiles: [
        "package-dependencies/{package_dependencies_platform}/node_modules/win-ca/**/*",
      ],
      outputDir: "out/node_modules/win-ca",
      platforms: ["win32-x64"],
    },
  ],

  // NOTE: This platforms object is a single source of truth for the list of
  // supported platforms. Each entry defines a platform and its platform_aliases, along
  // with a list of variables that can be expanded in the entry fields above.
  // The entire set of platforms specified here are enumerated in cases there
  // are no pre-specified target platforms. (like when purging assets, or
  // copying assets that are for each and every platform.)
  platforms: {
    "linux-x64": {
      platform_aliases: ["alpine-x64"],
      os: "Linux",
      arch: "x86-64",
      package_dependencies_platform: "linux-x64",
      bindings_suffix: "linux-x64",
      node_modules_abi: process.versions.modules,
    },
    "darwin-arm64": {
      os: "macOS",
      arch: "arm64",
      package_dependencies_platform: "darwin-arm64",
      bindings_suffix: "darwin-arm64",
      node_modules_abi: process.versions.modules,
    },
    "win32-x64": {
      os: "Windows",
      arch: "x86-64",
      package_dependencies_platform: "win32-x64",
      bindings_suffix: "win32-x64",
      node_modules_abi: process.versions.modules,
    },
  },
};

function getPlatforms({ filter = null } = {}) {
  const platforms = [];

  Object.entries(packageConfiguration.platforms).forEach(
    ([platform, variables]) => {
      platforms.push(platform);
      if (variables.platform_aliases) {
        platforms.push(...variables.platform_aliases);
      }
    },
  );

  if (filter) {
    return platforms.filter((platform) =>
      filter.some((pattern) => minimatch(platform, pattern)),
    );
  }
  return platforms;
}

async function copyFile(sourceFile, destinationFile) {
  console.log(`    ${sourceFile} →\n        ${destinationFile}`);
  await fs.copyFile(sourceFile, destinationFile);
}

async function copyDirectory(sourceDir, destinationDir) {
  console.log(`    ${sourceDir} →\n        ${destinationDir}`);
  await fs.mkdir(destinationDir, { recursive: true });

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destPath);
    } else {
      await copyFile(sourcePath, destPath);
    }
  }
}

async function processPackageConfigurationEntry(
  message,
  entry,
  condition,
  callback,
) {
  const destinationDir = path.resolve(projectRoot, entry.outputDir ?? ".");
  let processed = false;

  for (const pattern of entry.inputFiles) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      ignore: entry.exclusions,
    });
    if (matches.length === 0) {
      continue;
    }

    const baseDir = findCommonPathRoot(matches);

    for (const match of matches) {
      const destinationFile = path.resolve(
        destinationDir,
        path.relative(baseDir, match),
      );
      const sourceFile = path.resolve(projectRoot, match);

      if (condition?.destinationExists !== undefined) {
        try {
          await fs.access(destinationFile);
          fileExists = true;
        } catch (error) {
          fileExists = false;
        }

        if (fileExists !== condition.destinationExists) {
          continue;
        }
      }

      if (!processed) {
        console.log(`\n${message}`);
        processed = true;
      }

      await callback({
        match,
        baseDir,
        destinationDir,
        relativePath: path.relative(baseDir, match),
        destinationFile,
        sourceFile,
      });
    }
  }
  return processed;
}

async function purgePackageAssets() {
  const platforms = getPlatforms();

  for (const entry of packageConfiguration.entries) {
    const expandedEntries = platforms.reduce((entries, target) => {
      return entries.concat(
        expandPackageConfigurationEntry(
          entry,
          packageConfiguration.platforms,
          target,
        ),
      );
    }, []);

    for (const expandedEntry of expandedEntries) {
      await processPackageConfigurationEntry(
        `Purging ${expandedEntry.description}…`,
        expandedEntry,
        { destinationExists: true },
        async ({ destinationFile }) => {
          try {
            await fs.rm(destinationFile, { recursive: true, force: true });
            console.log(`    ${destinationFile}`);
          } catch (error) {
            if (error.code !== "ENOENT") {
              throw error;
            }
          }
        },
      );
    }
  }
}

function expandPackageConfigurationEntry(entry, platforms, target) {
  if (!platforms) return [entry];

  const relevantPlatforms = target
    ? getPlatforms({ filter: [target] })
    : getPlatforms();

  const entryPlatformMap = new Map();
  for (const platform of relevantPlatforms) {
    const variables = platforms[platform];
    if (!variables) continue;

    if (
      entry.platforms &&
      !entry.platforms.some((pattern) => minimatch(platform, pattern))
    )
      continue;

    const expandedEntry = { ...entry };
    delete expandedEntry.platforms;

    for (const [key, value] of Object.entries(expandedEntry)) {
      if (typeof value !== "string" && !Array.isArray(value)) continue;
      expandedEntry[key] = expandTemplate(value, { ...variables, platform });
    }

    const entryKey = JSON.stringify(expandedEntry);

    if (entryPlatformMap.has(entryKey)) {
      const platforms = entryPlatformMap.get(entryKey);
      platforms.push(platform);
    } else {
      entryPlatformMap.set(entryKey, [platform]);
    }
  }

  let expandedEntries = Array.from(entryPlatformMap.entries()).map(
    ([entryKey, platforms]) => {
      const entry = JSON.parse(entryKey);
      entry.platforms = platforms;
      return entry;
    },
  );

  if (expandedEntries.length === 0) expandedEntries = [entry];

  return expandedEntries;
}

async function copyPackageAssets(target) {
  for (const entry of packageConfiguration.entries) {
    const expandedEntries = expandPackageConfigurationEntry(
      entry,
      packageConfiguration.platforms,
      target,
    );

    for (const expandedEntry of expandedEntries) {
      await fs.mkdir(
        path.resolve(projectRoot, expandedEntry.outputDir ?? "."),
        {
          recursive: true,
        },
      );

      await processPackageConfigurationEntry(
        `Copying ${expandedEntry.description}…`,
        expandedEntry,
        null,
        async ({ sourceFile, destinationFile }) => {
          const fileStatus = await fs.stat(sourceFile);

          if (fileStatus.isDirectory()) {
            await copyDirectory(sourceFile, destinationFile);
          } else {
            await fs.mkdir(path.dirname(destinationFile), { recursive: true });
            await copyFile(sourceFile, destinationFile);
          }
        },
      );
    }
  }
}

async function buildSidebarUi() {
  console.log("\nBuilding Sidebar UI…");
  const guiDir = path.resolve(projectRoot, "continue/gui/");
  await runCommand("npm: ", `${NPM} run build`, guiDir);
}

async function runVsce(isRelease, target) {
  console.log("\nPackaging extension…");
  let command = [
    NPX,
    "vsce",
    "package",
    "--out",
    "./build",
    "--readme-path",
    "README.marketplace.md",
  ];

  if (!isRelease) {
    command.push("--pre-release");
  }
  command.push("--no-dependencies");
  if (target) {
    command.push("--target", target);
  }

  await runCommand("vsce: ", command);
}

function parseCommandLine(args) {
  let target = null;
  let isRelease = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--target") {
      if (i + 1 >= args.length) {
        throw new Error("--target requires a platform argument");
      }
      target = args[i + 1];
      i++;
    } else if (args[i] === "--release") {
      isRelease = true;
    } else {
      throw new Error(`Unknown argument: ${args[i]}`);
    }
  }

  return { target, isRelease };
}

async function main() {
  const { target, isRelease } = parseCommandLine(process.argv.slice(2));

  await fs.mkdir("build", { recursive: true });
  await purgePackageAssets();
  await buildSidebarUi();
  await copyPackageAssets(target);
  await runVsce(isRelease, target);
}

main().catch((e) => {
  if (/exited with status/.test(e.message)) {
    console.error(e.message);
  } else {
    console.error(e);
  }
  process.exit(1);
});
