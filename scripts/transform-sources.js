const { Project, SyntaxKind } = require("ts-morph");
const fs = require("fs").promises;
const { glob } = require("glob");
const path = require("path");

const transformationConfiguration = {
  entries: [
    {
      description: "Continue React App Sources",
      inputFiles: ["./continue/gui/**/*"],
      fileExclusions: [
        "./configure/gui/dist/*",
        "./**/node_modules/**",
        "./**/package*.json",
        "./**/tsconfig*.json",
      ],
      outputDir: "./gui",
    },
    {
      description: "Continue Core Backend Sources",
      inputFiles: ["./continue/core/**/*"],
      fileExclusions: [
        "./**/node_modules/**",
        "./**/package*.json",
        "./**/tsconfig.json",
      ],
      outputDir: "./core",
    },
    {
      description: "Continue VSCode Extension Sources",
      inputFiles: ["./continue/extensions/vscode/src/**/*"],
      fileExclusions: [
        "./**/node_modules/**",
        "./**/package*.json",
        "./**/tsconfig.json",
      ],
      outputDir: "./extension",
    },

    {
      description: "ESBuild import.meta.url Compatibility Shim",
      inputFiles: ["./continue/extensions/vscode/scripts/importMetaUrl.js"],
      outputDir: "./extension",
    },
  ],
  substitutions: [
    {
      pattern: /continue/,
      replacement: "granite",
      preserveCase: false,
      kind: SyntaxKind.Identifier,
    },
    {
      pattern: /^continue[.]/,
      replacement: "granite.",
      preserveCase: false,
      kind: SyntaxKind.StringLiteral,
    },
    {
      pattern: /^Continue.continue$/,
      replacement: "redhat.granite-code",
      preserveCase: false,
      kind: SyntaxKind.StringLiteral,
    },
    {
      pattern: /continueGUI/,
      replacement: "graniteGUI",
      preserveCase: true,
      kind: SyntaxKind.StringLiteral,
    },
    {
      pattern: /CONTINUE_GLOBAL_DIR/,
      replacement: "GRANITE_GLOBAL_DIR",
      preserveCase: true,
      kind: SyntaxKind.PropertyAccessExpression,
    },
  ],
};

function findCommonRoot(paths) {
  if (paths.length === 0) {
    return "";
  }

  const commonSegments = [];
  let index = 0;
  let segmentsMatch = true;
  while (segmentsMatch) {
    let currentSegment = null;
    for (const directoryPath of paths) {
      const segments = directoryPath.split(path.sep);
      if (index >= segments.length) {
        segmentsMatch = false;
        break;
      }

      if (currentSegment === null) {
        currentSegment = segments[index];
      } else if (currentSegment !== segments[index]) {
        segmentsMatch = false;
        break;
      }
    }

    if (segmentsMatch) commonSegments.push(currentSegment);
    index++;
  }

  return commonSegments.join(path.sep);
}

function applySubstitution(text, substitution) {
  const { pattern, replacement, preserveCase = true } = substitution;

  return text.replace(pattern, (match) => {
    if (!preserveCase) {
      if (match === match.toUpperCase()) return replacement.toUpperCase();

      if (match === match.toLowerCase()) return replacement.toLowerCase();

      if (match[0] === match[0].toUpperCase())
        return (
          replacement[0].toUpperCase() + replacement.slice(1).toLowerCase()
        );
    }

    return replacement;
  });
}

async function sourceEntryTransformation(entry, project) {
  const { inputFiles, outputDir, fileExclusions = [] } = entry;
  const matchedFiles = new Set();

  for (const pattern of inputFiles) {
    const files = await glob(pattern, { nodir: true, ignore: fileExclusions });
    files.forEach((file) => matchedFiles.add(path.resolve(file)));
  }

  const matchedDirectories = new Set();
  matchedFiles.forEach((file) => matchedDirectories.add(path.dirname(file)));

  const basePath = findCommonRoot([...matchedDirectories]);

  for (const file of matchedFiles) {
    const relativePath = path.relative(basePath, file);
    const targetPath = path.join(outputDir, relativePath);

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      const fileStatus = await fs.lstat(file);
      if (!fileStatus.isDirectory()) {
        await fileTransformation(file, targetPath, project);
      }
    } catch (error) {
      console.error(`Error processing file ${file}: ${error.message}`);
    }
  }
}

async function fileFreshnessCheck(sourcePath, targetPath) {
  try {
    const sourceStatus = await fs.stat(sourcePath);
    const targetStatus = await fs.stat(targetPath);

    return targetStatus.mtime >= sourceStatus.mtime;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return false;
}

async function typeScriptFileTransformation(sourcePath, targetPath, project) {
  const sourceFile = project.addSourceFileAtPath(sourcePath);

  sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .forEach((identifier) => {
      const name = identifier.getText();

      transformationConfiguration.substitutions.forEach((substitution) => {
        if (substitution.kind && substitution.kind !== SyntaxKind.Identifier)
          return;

        if (substitution.pattern.test(name)) {
          const newName = applySubstitution(name, substitution);
          console.log(`        ${substitution.pattern}: ${name} → ${newName}`);
          identifier.rename(newName);
        }
      });
    });

  sourceFile
    .getDescendantsOfKind(SyntaxKind.StringLiteral)
    .forEach((stringLiteral) => {
      // Remove quotes
      let text = stringLiteral.getText().slice(1, -1);

      transformationConfiguration.substitutions.forEach((substitution) => {
        if (substitution.kind && substitution.kind !== SyntaxKind.StringLiteral)
          return;

        if (substitution.pattern.test(text)) {
          const newText = applySubstitution(text, substitution);
          console.log(
            `        ${substitution.pattern}: "${text}" → "${newText}"`,
          );
          stringLiteral.replaceWithText(`"${newText}"`);
          text = newText;
        }
      });
    });

  sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .forEach((property) => {
      const name = property.getName();

      transformationConfiguration.substitutions.forEach((substitution) => {
        if (
          substitution.kind &&
          substitution.kind !== SyntaxKind.PropertyAccessExpression
        )
          return;

        if (substitution.pattern.test(name)) {
          const newName = applySubstitution(name, substitution);
          console.log(`        ${substitution.pattern}: ${name} → ${newName}`);
          property.rename(newName);
        }
      });
    });

  const transformedCode = sourceFile.getFullText();
  await fs.writeFile(targetPath, transformedCode, "utf8");

  return true;
}

async function jsonFileTransformation(sourcePath, targetPath) {
  const jsonContent = await fs.readFile(sourcePath, "utf8");
  const parsedJson = JSON.parse(jsonContent);
  const transformedJson = JSON.stringify(
    parsedJson,
    (key, value) => {
      if (typeof value === "string") {
        transformationConfiguration.substitutions.forEach(
          ({ pattern, replacement }) => {
            if (pattern.test(value)) {
              value = value.replace(pattern, replacement);
            }
          },
        );
      }
      return value;
    },
    4,
  );

  await fs.writeFile(targetPath, transformedJson, "utf8");

  return true;
}

async function fileTransformation(sourcePath, targetPath, project) {
  const targetIsFresh = await fileFreshnessCheck(sourcePath, targetPath);

  if (targetIsFresh) return;

  try {
    console.log(`    ${sourcePath} →\n       ${targetPath}`);

    let fileTransformed = false;
    try {
      if (sourcePath.endsWith(".ts") || sourcePath.endsWith(".tsx")) {
        fileTransformed = await typeScriptFileTransformation(
          sourcePath,
          targetPath,
          project,
        );
      } else if (sourcePath.endsWith(".json")) {
        fileTransformed = await jsonFileTransformation(sourcePath, targetPath);
      }
    } catch {
      fileTransformed = false;
    }

    if (!fileTransformed) await fs.copyFile(sourcePath, targetPath);
  } catch (error) {
    console.error(`Error processing file ${sourcePath}: ${error.message}`);
  }
}

async function sourceFilesTransformations() {
  const project = new Project();

  for (const entry of transformationConfiguration.entries) {
    console.log(`\nTransforming ${entry.description}…`);
    try {
      await fs.mkdir(entry.outputDir, { recursive: true });

      await sourceEntryTransformation(entry, project);
    } catch (error) {
      console.error(
        `Error processing entry ${entry.description}: ${error.message}`,
      );
    }
  }
}

async function main() {
  await sourceFilesTransformations();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
