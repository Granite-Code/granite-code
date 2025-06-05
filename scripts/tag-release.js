const { exec } = require("node:child_process");
const path = require("path");
const util = require("node:util");
const execAsync = util.promisify(exec);
const {
  runCommand,
  readPackageJson,
  writePackageJson
} = require("./utils.js");

async function getExistingTags(pattern) {
  const { stdout } = await execAsync(`git tag --list "${pattern}"`);
  return stdout.split("\n").filter((tag) => tag.trim() !== "");
}

async function determineNextUnstableVersion(currentVersion) {
  const [major, minor, _] = currentVersion.split(".").map(Number);

  let tags = await getExistingTags(`${major}.${minor}.*`);
  if (tags.length === 0) return `${currentVersion}`;

  let nextMinor = minor;
  if (nextMinor % 2 === 0) {
    nextMinor++;
    tags = await getExistingTags(`${major}.${nextMinor}.*`);
  }

  let nextPatch;
  if (tags.length > 0) {
    const patchVersions = tags.map((tag) => {
      const parts = tag.trim().split(".");
      return parseInt(parts[2], 10);
    });

    nextPatch = Math.max(...patchVersions) + 1;
  } else {
    nextPatch = 0;
  }

  return `${major}.${nextMinor}.${nextPatch}`;
}

async function determineNextStableVersion(currentVersion) {
    const [major, minor, _] = currentVersion.split(".").map(Number);
    let stableMinor = minor + 1;

    if (stableMinor % 2 != 0)
      stableMinor++;

    return `${major}.${stableMinor}.0`;
}

async function doSnapshot(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const packageLockPath = path.join(packageDir, "package-lock.json");
  const packageObject = await readPackageJson(packageJsonPath);
  const currentVersion = packageObject.version;
  const version = await determineNextUnstableVersion(currentVersion);

  console.log(`Tagging snapshot ${version}`);
  await runCommand("git:     ", ["git", "tag", "-a", version, "-m", version]);

  // Update package.json so packages can be built, but don't commit result
  packageObject.version = version;
  await writePackageJson(packageJsonPath, packageObject);
}

async function doRelease(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const packageLockPath = path.join(packageDir, "package-lock.json");
  const packageObject = await readPackageJson(packageJsonPath);
  const currentVersion = packageObject.version;
  const version = await determineNextStableVersion(currentVersion);

  packageObject.version = version;
  await writePackageJson(packageJsonPath, packageObject);
  await runCommand("npm:     ", "npm install --package-lock-only");
  const fileList = [packageJsonPath, packageLockPath];
  await runCommand("git:     ", ["git", "add", ...fileList]);
  await runCommand("git:     ", ["git", "commit", "-m", `Release ${version}`]);

  console.log(`Tagging release ${version}`);
  await runCommand("git:     ", ["git", "tag", "-a", version, "-m", version]);
}

async function main() {
  const toplevelSourceDir = path.join(__dirname, "..");
  const args = process.argv.slice(2);
  if (args.includes("--snapshot")) {
    await doSnapshot(toplevelSourceDir);
  } else {
    await doRelease(toplevelSourceDir);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
