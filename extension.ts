/**
 * This is the entry point for the extension.
 */
import * as vscode from "vscode";
import * as Paths from "core/util/paths";
import { setupCa } from "core/util/ca";

async function dynamicImportAndActivate(context: vscode.ExtensionContext) {
  await setupCa();
  const { activateExtension } = await import("activation/activate");
  return await activateExtension(context);
}

export function activate(context: vscode.ExtensionContext) {
  return dynamicImportAndActivate(context).catch((e) => {
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

export function deactivate() {
}
