/**
 * This is the entry point for the extension.
 */
import * as vscode from "vscode";
import { setupCa } from "./continue/core/util/ca";

async function activateAsync(context: vscode.ExtensionContext) {
  await setupCa();
  const { activateExtension } = await import(
    "./continue/extensions/vscode/src/activation/activate"
  );
  console.log("activating extension");
  return await activateExtension(context);
}

export function activate(context: vscode.ExtensionContext) {
  return activateAsync(context).catch((e) => {
    console.log("Error activating extension: ", e);
    vscode.window
      .showWarningMessage(
        "Error activating the Granite.Code extension.",
        "View Logs",
        "Retry",
      )
      .then((selection) => {
        if (selection === "View Logs") {
          vscode.commands.executeCommand("granite.viewLogs");
        } else if (selection === "Retry") {
          // Reload VS Code window
          vcode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  });
}

export function deactivate() {}
