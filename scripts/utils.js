const { readFile, writeFile } = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { Transform } = require("stream");

exports.NPM = process.platform == "win32" ? "npm.cmd" : "npm";
exports.NPX = process.platform == "win32" ? "npx.cmd" : "npx";

async function readPackageJson(relativePath) {
  const packageJsonPath = path.resolve(__dirname, relativePath);
  const packageJsonContents = await readFile(packageJsonPath);
  return JSON.parse(packageJsonContents);
}

async function writePackageJson(relativePath, jsonContents) {
  const packageJsonPath = path.resolve(__dirname, relativePath);
  const strContents = JSON.stringify(jsonContents, null, 2) + "\n";
  await writeFile(packageJsonPath, strContents);
}

function waitForSubprocess(subprocess, command) {
  return new Promise((resolve, reject) => {
    subprocess.on("close", (code) => {
      if (code == 0) {
        resolve(true);
      } else {
        reject(new Error(`'${command.join(" ")}' exited with status ${code}`));
      }
    });

    subprocess.on("error", (err) => {
      reject(new Error(`'${command.join(" ")}' failed: ${err.message}`));
    });
  });
}

class LineStream extends Transform {
  constructor() {
    super({ readableObjectMode: true });
    this.partialLine = "";
  }

  _transform(chunk, encoding, callback) {
    this.partialLine += chunk.toString();
    const lines = this.partialLine.split(/\r?\n/);
    this.partialLine = lines.pop();

    lines.forEach((line) => this.push(line));
    callback();
  }

  _flush(callback) {
    if (this.partialLine) this.push(this.partialLine);

    callback();
  }
}

/**
 * Utility function to find the shared root between all passed in
 * file paths.
 *
 * @param {Array} filePaths - Array of file paths with a common root
 */
function findCommonPathRoot(filePaths) {
  if (filePaths.length === 0) {
    return "";
  }

  const commonSegments = [];
  let index = 0;
  let segmentsMatch = true;
  while (segmentsMatch) {
    let currentSegment = null;
    for (const filePath of filePaths) {
      const directoryPath = path.dirname(filePath);
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

exports.findCommonPathRoot = findCommonPathRoot;

/**
 * Convenience async function to run a command, prefixing the
 * each line of stderr/stdout with a given string.
 *
 * @param {string} outputPrefix - prefix to add to each line
 * @param {string|Array} command - Command to run
 * @param {string|undefined} cwd - working directory
 */
async function runCommand(outputPrefix, command, cwd) {
  if (typeof command == "string") command = command.split(/\s+/);

  const options = {};
  if (cwd) {
    options.cwd = cwd;
  }
  const subprocess = spawn(command[0], command.slice(1), options);
  subprocess.stdout.pipe(new LineStream()).on("data", (line) => {
    console.error("%s%s", outputPrefix, line);
  });
  subprocess.stderr.pipe(new LineStream()).on("data", (line) => {
    console.error("%s%s", outputPrefix, line);
  });

  await waitForSubprocess(subprocess, command);
}

exports.runCommand = runCommand;

/**
 * Expands template strings in values using the provided variables
 * @param {string|Array} value - The template string or array to expand
 * @param {Object} variables - Object containing variable values
 * @returns {string|Array} The expanded value
 */
function expandTemplate(value, variables) {
  if (typeof value === "string") {
    return value.replace(/\{(\w+)\}/g, (match, key) => variables[key] || match);
  }
  if (Array.isArray(value)) {
    return value.map((item) => expandTemplate(item, variables));
  }
  return value;
}

exports.expandTemplate = expandTemplate;
