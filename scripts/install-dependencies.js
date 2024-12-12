const path = require("path");
const { promisify } = require("util");
const fs = require("fs").promises;
const { runCommand } = require("./utils.js");

// The glob module may not be available until after nodeModulesInstallation returns
// so it'll get imported later
let glob;

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
      description: "SQLite library",
      inputFiles: ["continue/core/node_modules/sqlite3/build/Release/*.node"],
      outputDir: "Release/",
    },

    {
      description: "XML Http Request Worker",
      inputFiles: [
        "continue/extensions/vscode/node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js",
      ],
    },
  ],
  root: "./out",
};

async function nodeModulesInstallation(packageDir) {
  console.log(
    `\nInstalling dependencies specified in ${packageDir}/package.json with npm to ${packageDir}/node_modules…\n`,
  );

  try {
    await runCommand("npm:     ", [
      "npm",
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

async function runtimeAssetsCopy() {
  let willCopyFiles = false;
  for (const entry of installConfiguration.entries) {
    let willCopyFilesForEntry = false;
    const inputFiles = [];
    for (const filePattern of entry.inputFiles) {
      const matches = await glob(filePattern);

      for (const match of matches) inputFiles.push(match);
    }

    for (const inputFile of inputFiles) {
      const sourceFile = path.resolve(inputFile);
      const destinationDir = path.resolve(
        installConfiguration.root,
        entry.outputDir ?? "./",
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
          console.log(`\nCopying ${entry.description}…`);
          willCopyFilesForEntry = true;
        }

        console.log(`    ${sourceFile} →\n        ${destinationFile}`);

        await fs.mkdir(destinationDir, { recursive: true });
        await fs.copyFile(sourceFile, destinationFile);
      }
    }
  }

  if (willCopyFiles) console.log("\nData files staged to install root.");
}

async function baseDependenciesInstallation() {
  console.log("\nInstalling base dependencies…");
  await nodeModulesInstallation(".");

  // glob should be available now
  glob = require("glob").glob;
}

async function main() {
  await baseDependenciesInstallation();
  await packageDependenciesInstallation();
  await runtimeAssetsCopy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
