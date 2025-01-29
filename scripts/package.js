// Adapted from continue/extensions/vscode/scripts/package.js
// Apache 2.0 © 2023-2024 Continue Dev, Inc.

const { promisify } = require("util");
const fs = require("fs");
const ncp = promisify(require("ncp").ncp);
const path = require("path");
const { rimraf } = require("rimraf");
const { runCommand } = require("./utils.js");

async function buildAndCopyGui() {
  console.log("Building GUI");
  const guiDir = path.resolve(__dirname, "../continue/gui/");
  const guiDistDir = path.resolve(__dirname, "../continue/gui/dist/");
  const targetDir = path.resolve(__dirname, "../gui/");

  await runCommand("gui: ", "npm run build", guiDir);

  console.log("Copying GUI assets ");
  await rimraf(targetDir);
  await ncp(guiDistDir, targetDir);
}

async function runVsce(isPreRelease, target) {
  console.log("Building extension");
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

  if (!fs.existsSync("build")) {
    fs.mkdirSync("build");
  }

  await buildAndCopyGui();
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
