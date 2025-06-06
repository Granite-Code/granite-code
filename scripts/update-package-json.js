// This script is responsible for transforming the "contributes" section of
// Continue's package.json into what we need for Granite.code.
//
// It:
//  - Replaces identifiers
//  - Replaces "Continue" with "Granite.Code" for human-readable strings
//  - Removes unwanted commands

const { readPackageJson, writePackageJson } = require("./utils.js");

function transform(data) {
  if (data == null) {
    return data;
  }

  if (typeof data == "string") {
    let result = data.replace(/^continue$/, "granite");
    result = result.replace(/(^| )continue\./, "$1granite.");
    result = result.replace(/(^| )config\.continue\./, "$1config\.granite.");
    result = result.replace(/continueGUI/, "graniteGUI");
    result = result.replace(/continueConsole/, "graniteConsole");
    result = result.replace(/\bContinue\b/, "Granite.Code");
    // An exception - this is actually meant to be Continue
    result = result.replace(
      "Write Granite.Code Config",
      "Write Continue Config",
    );
    return result;
  }

  if (Array.isArray(data)) {
    return data.map((item) => transform(item));
  }

  if (typeof data == "object") {
    const result = {};
    for (const [key, value] of Object.entries(data))
      result[transform(key)] = transform(value);

    return result;
  }

  return data;
}

function compare(data1, data2) {
  if (Array.isArray(data1)) {
    if (!Array.isArray(data2)) return false;
    if (data1.length != data2.length) return false;
    for (let i = 0; i < data1.length; i++)
      if (!compare(data1[i], data2[i])) return false;
  }

  if (typeof data1 == "object") {
    if (typeof data2 != "object") return false;

    for (const [key, value] of Object.entries(data1)) {
      if (!compare(value, data2[value])) return false;
    }

    for (const key of Object.keys(data2)) {
      if (!Object.hasOwn(data1, key)) return false;
    }

    return true;
  }

  return data1 == data2;
}

async function main() {
  const continuePackageJson = await readPackageJson(
    "../continue/extensions/vscode/package.json",
  );
  const granitePackageJson = await readPackageJson("../package.json");

  const continueContributes = continuePackageJson["contributes"];
  const oldGraniteContributes = granitePackageJson["contributes"];

  const newGraniteContributes = transform(continueContributes);

  delete newGraniteContributes["configuration"]["properties"][
    "granite.enableContinueForTeams"
  ];
  delete newGraniteContributes["configuration"]["properties"][
    "granite.remoteConfigServerUrl"
  ];
  delete newGraniteContributes["configuration"]["properties"][
    "granite.remoteConfigSyncPeriod"
  ];
  delete newGraniteContributes["configuration"]["properties"][
    "granite.userToken"
  ];
  delete newGraniteContributes["configuration"]["properties"][
    "granite.telemetryEnabled"
  ];

  if (!compare(newGraniteContributes, oldGraniteContributes)) {
    granitePackageJson["contributes"] = newGraniteContributes;
    await writePackageJson("../package.json", granitePackageJson);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
