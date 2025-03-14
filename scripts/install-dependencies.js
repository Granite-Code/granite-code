const path = require("path");
const { promisify } = require("util");
const fs = require("fs").promises;
const { NPM, runCommand, expandTemplate } = require("./utils.js");

// The glob and minimatch modules may not be available until after nodeModulesInstallation returns
// so they'll get imported later
let glob;
let minimatch;

const dependencyConfiguration = {
  entries: [
    {
      description: "Backend dependencies",
      packageDir: "./continue/core",
    },
    {
      description: "GUI (Web App) dependencies",
      packageDir: "./continue/gui",
    },
    {
      description: "Extension dependencies",
      packageDir: "./continue/extensions/vscode",
    },
  ],

  toplevelNodeModules: "./node_modules",
};

const installConfiguration = {
  entries: [
    {
      description: "Tree-sitter module",
      inputFiles: [
        "continue/core/node_modules/web-tree-sitter/tree-sitter.wasm",
      ],
    },
    {
      description: "Tree-sitter data files",
      inputFiles: [
        "continue/core/node_modules/tree-sitter-wasms/out/tree-sitter-*.wasm",
      ],
      outputDir: "tree-sitter-wasms/",
    },
    {
      description: "LLM tokenizer modules",
      inputFiles: ["continue/core/llm/llamaTokenizer*.mjs"],
    },
    {
      description:
        "LLM tokenizer modules workerpool dependency for VSIX package",
      inputModules: ["workerpool"],
      outputDir: "../package-dependencies/noarch",
    },
    {
      description: "SQLite3 library for {os} ({arch})",
      inputModules: ["sqlite3"],
      outputDir: "../package-dependencies/{package_dependencies_platform}",
    },
    {
      description: "SQLite3 library for in-tree testing",
      inputFiles: [
        "package-dependencies/{package_dependencies_platform}/node_modules/sqlite3/build/Release/node_sqlite3.node",
      ],
      outputDir: "../build",
      platforms: [`${process.platform}-${process.arch}`],
     },
     {
       description: "Lancedb for in-tree testing",
       inputModules: ["lancedb"],
       outputDir: "../node_modules",
       platforms: [`${process.platform}-${process.arch}`],
    },
    {
      description: "XML Http Request Worker",
      inputFiles: [
        "continue/extensions/vscode/node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js",
      ],
    },
    {
      description: "LanceDB vector database for {os} ({arch})",
      inputModules: ["@lancedb/vectordb-{vectordb_platform}"],
      outputDir: "../package-dependencies/{package_dependencies_platform}",
    },
    {
      description: "esbuild binaries for {os} ({arch})",
      inputModules: ["esbuild-{esbuild_platform}"],
      outputDir: "../package-dependencies/{package_dependencies_platform}",
    },
    {
      description:
        "Binaries for accessing system Certificate Authority on Windows ({arch})",
      inputModules: ["win-ca"],
      outputDir: "../package-dependencies/{package_dependencies_platform}",
      platforms: ["win32-x64"],
    },
  ],

  platforms: {
    "linux-x64": {
      platform_aliases: ["alpine-x64"],
      os: "Linux",
      arch: "x86-64",
      package_dependencies_platform: "linux-x64",
      vectordb_platform: "linux-x64-gnu",
      esbuild_platform: "linux-64",
    },
    "darwin-arm64": {
      os: "macOS",
      arch: "arm64",
      package_dependencies_platform: "darwin-arm64",
      vectordb_platform: "darwin-arm64",
      esbuild_platform: "darwin-arm64",
    },
    "win32-x64": {
      os: "Windows",
      arch: "x86-64",
      package_dependencies_platform: "win32-x64",
      vectordb_platform: "win32-x64-msvc",
      esbuild_platform: "windows-64",
    },
  },
  root: "./out",
};

function getPlatforms({ filter = null } = {}) {
  const platforms = [];

  Object.entries(installConfiguration.platforms).forEach(
    ([platform, variables]) => {
      platforms.push(platform);
      if (variables.platform_aliases)
        platforms.push(...variables.platform_aliases);
    },
  );

  if (filter) {
    return platforms.filter((platform) =>
      filter.some((pattern) => minimatch(platform, pattern)),
    );
  }
  return platforms;
}

function expandInstallConfigurationEntry(entry, platforms, target) {
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

async function nodeModulesInstallation(packageDir) {
  console.log(
    `\nInstalling dependencies specified in ${packageDir}/package.json with npm to ${packageDir}/node_modules…\n`,
  );

  try {
    await runCommand("npm:     ", [
      NPM,
      "install",
      "--no-fund",
      "--no-audit",
      "--no-save",
      "-C",
      packageDir,
    ]);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

async function packageDependenciesInstallation() {
  for (const entry of dependencyConfiguration.entries) {
    console.log(`\nInstalling ${entry.description}…`);
    await nodeModulesInstallation(entry.packageDir);
  }
}

async function runtimeAssetsCopy(target) {
  let willCopyFiles = false;
  for (const entry of installConfiguration.entries) {
    if (!entry.inputFiles) continue;

    const expandedEntries = expandInstallConfigurationEntry(
      entry,
      installConfiguration.platforms,
      target,
    );

    for (const expandedEntry of expandedEntries) {
      let willCopyFilesForEntry = false;
      const inputFiles = [];
      for (const filePattern of expandedEntry.inputFiles) {
        const matches = await glob(filePattern);
        for (const match of matches) inputFiles.push(match);
      }

      if (
        target &&
        expandedEntry.platforms &&
        !expandedEntry.platforms.some((pattern) => minimatch(target, pattern))
      ) {
        continue;
      }

      for (const inputFile of inputFiles) {
        const sourceFile = path.resolve(inputFile);
        const destinationDir = path.resolve(
          installConfiguration.root,
          expandedEntry.outputDir ?? "./",
        );
        const destinationFile = path.resolve(
          destinationDir,
          path.basename(sourceFile),
        );

        let destinationFileStale;
        try {
          const [sourceFileStatus, destinationFileStatus] = await Promise.all([
            fs.stat(sourceFile),
            fs.stat(destinationFile),
          ]);
          destinationFileStale =
            sourceFileStatus.mtime > destinationFileStatus.mtime;
        } catch (error) {
          destinationFileStale = true;
        }

        if (destinationFileStale) {
          if (!willCopyFiles) {
            console.log("\nStaging data files to install root…");
            willCopyFiles = true;
          }

          if (!willCopyFilesForEntry) {
            console.log(`\nCopying ${expandedEntry.description}…`);
            willCopyFilesForEntry = true;
          }

          console.log(`    ${sourceFile} →\n        ${destinationFile}`);

          await fs.mkdir(destinationDir, { recursive: true });
          await fs.copyFile(sourceFile, destinationFile);
        }
      }
    }
  }
  if (willCopyFiles) console.log("\nData files staged to install root.");
}

async function baseDependenciesInstallation() {
  console.log("\nInstalling base dependencies…");
  await nodeModulesInstallation(".");

  // glob and minimatch should be available now
  glob = require("glob").glob;
  minimatch = require("minimatch").minimatch;
}

async function platformDependenciesInstallation(target) {
  let installed = false;

  for (const entry of installConfiguration.entries) {
    if (!entry.inputModules) continue;

    const expandedEntries = expandInstallConfigurationEntry(
      entry,
      installConfiguration.platforms,
      target,
    );

    for (const expandedEntry of expandedEntries) {
      if (
        target &&
        expandedEntry.platforms &&
        !expandedEntry.platforms.some((pattern) => minimatch(target, pattern))
      ) {
        continue;
      }

      let platform, architecture;
      if (target) {
        [platform, architecture] = target.split("-");
      } else {
        [platform, architecture] = expandedEntry.platforms[0].split("-");
      }

      const outputDir = path.resolve(
        installConfiguration.root,
        expandedEntry.outputDir ?? "./",
      );

      if (!installed) {
        console.log("\nInstalling platform-specific dependencies...");
        installed = true;
      }

      console.log(`\nInstalling ${expandedEntry.description}…`);

      const expandedInputModules = expandedEntry.inputModules.map((module) =>
        expandTemplate(module, {
          platform,
          arch: architecture,
        }),
      );

      await fs.mkdir(outputDir, { recursive: true });
      await runCommand("npm:     ", [
        NPM,
        "install",
        ...expandedInputModules,
        `--arch=${architecture}`,
        `--platform=${platform}`,
        "--force",
        "--prefix",
        outputDir,
      ]);
    }
  }

  if (installed) {
    console.log("\nPlatform-specific dependencies installed.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  let target;

  if (args[0] === "--target") {
    target = args[1];
  }

  await baseDependenciesInstallation();
  await packageDependenciesInstallation();
  await platformDependenciesInstallation(target);
  await runtimeAssetsCopy(target);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
