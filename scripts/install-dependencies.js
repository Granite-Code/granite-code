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
      platforms: [`${process.platform}-${process.arch}`],
    },
    {
      description: "SQLite3 library for {os} ({arch})",
      inputModules: ["sqlite3"],
      outputDir: "../package-dependencies/{package_dependencies_platform}",
    },
    {
      description: "SQLite3 library for in-tree testing",
      inputFiles: [
        "package-dependencies/{package_dependencies_platform}/node_modules/sqlite2/build/Release/node_sqlite3.node",
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
      platforms: ["linux-x64", "linux-arm64", "darwin-arm64", "win32-x64"],
    },
    {
      description: "esbuild binaries for {os} ({arch})",
      inputModules: ["esbuild-{esbuild_platform}"],
      outputDir: "../package-dependencies/{package_dependencies_platform}",
      platforms: ["linux-x64", "linux-arm64", "darwin-arm64", "win32-x64"],
    },
    {
      description:
        "Binaries for accessing system Certificate Authority on Windows ({arch})",
      inputModules: ["win-ca"],
      outputDir: "../package-dependencies/{package_dependencies_platform}",
      platforms: ["win32-x64"],
    },
  ],
  variables: [
    {
      platforms: ["linux-x64", "alpine-x64"],
      os: "Linux",
      arch: "x86-64",
      package_dependencies_platform: "linux-x64",
      vectordb_platform: "linux-x64-gnu",
      esbuild_platform: "linux-64",
    },
    {
      platforms: ["linux-arm64", "alpine-arm64"],
      os: "Linux",
      arch: "arm64",
      package_dependencies_platform: "linux-arm64",
      vectordb_platform: "linux-arm64-gnu",
      esbuild_platform: "linux-arm64",
    },
    {
      platforms: ["darwin-arm64"],
      os: "macOS",
      arch: "arm64",
      package_dependencies_platform: "darwin-arm64",
      vectordb_platform: "darwin-arm64",
      esbuild_platform: "darwin-arm64",
    },
    {
      platforms: ["win32-x64"],
      os: "Windows",
      arch: "x86-64",
      package_dependencies_platform: "win32-x64",
      vectordb_platform: "win32-x64-msvc",
      esbuild_platform: "windows-64",
    },
  ],
  root: "./out",
};

function expandInstallConfigurationEntry(entry, variables) {
  const expandedEntries = [];

  if (!variables) return [entry];

  for (const variableEntries of variables) {
    if (
      entry.platforms &&
      !entry.platforms.some((p) => variableEntries.platforms.includes(p))
    ) {
      continue;
    }

    const expandedEntry = {
      ...entry,
      platforms: variableEntries.platforms,
    };

    for (const [key, value] of Object.entries(entry)) {
      expandedEntry[key] = expandTemplate(value, variableEntries);
    }

    expandedEntries.push(expandedEntry);
  }

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
      installConfiguration.variables,
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
        !expandedEntry.platforms?.some((pattern) => minimatch(target, pattern))
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
      installConfiguration.variables,
    );

    for (const expandedEntry of expandedEntries) {
      if (
        target &&
        !expandedEntry.platforms?.some((pattern) => minimatch(target, pattern))
      ) {
        continue;
      }

      const platform = target ? target.split("-")[0] : process.platform;
      const architecture = target ? target.split("-")[1] : process.arch;

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
          platform: target || `${platform}-${architecture}`,
        }),
      );

      await fs.mkdir(outputDir, { recursive: true });
      await runCommand("npm:     ", [
        NPM,
        "install",
        ...expandedInputModules,
        "--architecture=" + architecture,
        "--platform=" + platform,
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
