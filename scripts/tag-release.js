const { readFile } = require("fs/promises");
const path = require("node:path");
const { exec } = require("node:child_process");
const util = require("node:util");
const execAsync = util.promisify(exec);
const { runCommand } = require("./utils.js");

async function readPackageJson(relativePath) {
  const packageJsonPath = path.resolve(__dirname, relativePath);
  const packageJsonContents = await readFile(packageJsonPath);
  return JSON.parse(packageJsonContents);
}

async function getExistingTags(pattern) {
  const { stdout } = await execAsync(`git tag --list "${pattern}"`);
  return stdout.split("\n").filter((tag) => tag.trim() !== "");
}

async function determineNextPatchVersion(currentVersion) {
  const [major, minor, _] = currentVersion.split(".");
  const minorNum = parseInt(minor, 10);

  if (minorNum % 2 === 0) {
    throw new Error(
      `Cannot tag pre-release for ${major}.${minor} series since it is an official release`,
    );
  }

  const pattern = `${major}.${minor}.*`;
  const tags = await getExistingTags(pattern);

  if (tags.length === 0) return `${currentVersion}`;

  const patchVersions = tags.map((tag) => {
    const parts = tag.trim().split(".");
    return parseInt(parts[2], 10);
  });

  const nextPatch = Math.max(...patchVersions) + 1;
  return `${major}.${minor}.${nextPatch}`;
}

async function main() {
  const package = await readPackageJson("../package.json");
  const currentVersion = package.version;
  const version = await determineNextPatchVersion(currentVersion);

  console.log(`Tagging prerelease ${version}`);
  await runCommand("git:     ", ["git", "tag", "-a", version, "-m", version]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
