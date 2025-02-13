// Adapted from continue/extensions/vscode/scripts/package.js
// Apache 2.0 © 2023-2024 Continue Dev, Inc.

const fs = require("fs").promises;
const path = require("path");
const { runCommand, findCommonPathRoot } = require("./utils.js");
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
      description: "Tree-sitter language tagging query files",
      inputFiles: ["continue/extensions/vscode/tag-qry/*.scm"],
      outputDir: "tag-qry/",
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
      outputDir: "out/",
      platforms: ["linux-*"],
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
      description: "arm64 Linux binary libraries for reading ONNX files",
      inputFiles: [
        "continue/core/node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/*",
      ],
      outputDir: "bin/napi-v3/linux/arm64/",
      platforms: ["linux-arm64", "alpine-arm64"],
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
      description: "arm64 macOS vector database library binaries",
      inputFiles: ["node_modules:darwin-arm64/node_modules/@lancedb/**/*"],
      outputDir: "out/node_modules/@lancedb",
      platforms: ["darwin-arm64"],
    },
    {
      description: "arm64 vector database library linux binaries",
      inputFiles: ["node_modules:linux-arm64/node_modules/@lancedb/**/*"],
      outputDir: "out/node_modules/@lancedb",
      platforms: ["linux-arm64", "alpine-arm64"],
    },
    {
      description: "x86-64 vector database library linux binaries",
      inputFiles: ["node_modules:linux-x64/node_modules/@lancedb/**/*"],
      outputDir: "out/node_modules/@lancedb",
      platforms: ["linux-x64", "alpine-x64"],
    },
  ],
};

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
  const destinationDir = path.resolve(projectRoot, entry.outputDir);
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
          const fileExists = await fs.access(destinationFile);
          if (fileExists !== condition.destinationExists) {
            continue;
          }
        } catch (error) {
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
  for (const entry of packageConfiguration.entries) {
    await processPackageConfigurationEntry(
      `Purging ${entry.description}…`,
      entry,
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

async function copyPackageAssets(target) {
  const currentPlatform = `${process.platform}-${process.arch}`;

  for (const entry of packageConfiguration.entries) {
    if (target && entry.platforms) {
      const matches = entry.platforms.some((pattern) =>
        minimatch(target, pattern),
      );

      if (!matches) {
        continue;
      }
    }

    await fs.mkdir(path.resolve(projectRoot, entry.outputDir), {
      recursive: true,
    });

    await processPackageConfigurationEntry(
      `Copying ${entry.description}…`,
      entry,
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

async function buildSidebarUi() {
  console.log("\nBuilding Sidebar UI…");
  const guiDir = path.resolve(projectRoot, "continue/gui/");
  await runCommand("npm: ", "npm run build", guiDir);
}

async function runVsce(isPreRelease, target) {
  console.log("\nPackaging extension…");
  let command = ["npx", "vsce", "package", "--out", "./build"];
  if (isPreRelease) {
    command.push("--pre-release");
  }
  command.push("--no-dependencies");
  if (target) {
    command.push("--target", target);
  }

  await runCommand("vsce: ", command);
}

async function main() {
  const args = process.argv.slice(2);
  let target;

  if (args[0] === "--target") {
    target = args[1];
  }

  const isPreRelease = args.includes("--pre-release");

  await fs.mkdir("build", { recursive: true });

  await purgePackageAssets();
  await copyPackageAssets(target);
  await buildSidebarUi();
  await runVsce(isPreRelease, target);
}

main().catch((e) => {
  if (/exited with status/.test(e.message)) {
    console.error(e.message);
  } else {
    console.error(e);
  }
  process.exit(1);
});
