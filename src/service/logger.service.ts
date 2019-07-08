import { OutputChannel, window } from "vscode";
import { Environment } from "../environment";
import { LocalConfig } from "../models/local-config.model";
import { state } from "../state";
import { File } from "./file.service";
import { ExtensionInformation } from "./plugin.service";

export class LoggerService {
  public static outputChannel: OutputChannel;

  public static defaultError = state.localize("common.error.message");

  public static statusMap = {
    500: "common.error.connection",
    401: "common.error.invalidToken",
    4: "common.error.canNotSave"
  };

  public static LogException(
    error: any,
    message: string,
    showMessageBox: boolean
  ): void {
    if (error) {
      console.error(error);
      if (error.status && this.statusMap[error.status]) {
        message = state.localize(this.statusMap[error.status]);
      }
    }

    if (showMessageBox) {
      window.showErrorMessage(message);
      window.setStatusBarMessage("").dispose();
    } else {
      window.setStatusBarMessage(message, 5000);
    }
  }

  public static ShowSummaryOutput(
    upload: boolean,
    files: File[],
    removedExtensions: ExtensionInformation[],
    addedExtensions: ExtensionInformation[],
    ignoredExtensions: ExtensionInformation[],
    syncSettings: LocalConfig
  ) {
    if (!LoggerService.outputChannel) {
      this.outputChannel = window.createOutputChannel("Settings Sync");
    }

    const outputChannel = this.outputChannel;
    outputChannel.appendLine(
      `Settings Sync ${upload ? "Upload" : "Download"} Summary`
    );
    outputChannel.appendLine(`Version: ${Environment.version}`);
    outputChannel.appendLine(`--------------------`);
    outputChannel.appendLine(
      `Export Type: ${syncSettings.customConfig.exportType}`
    );
    outputChannel.appendLine(``);
    outputChannel.appendLine(
      `Restarting Visual Studio Code may be required to apply color and file icon theme.`
    );
    outputChannel.appendLine(`--------------------`);

    outputChannel.appendLine(`Files ${upload ? "Upload" : "Download"}ed:`);
    files
      .filter(item => item.fileName.indexOf(".") > 0)
      .forEach(item => {
        outputChannel.appendLine(`  ${item.fileName} > ${item.remoteName}`);
      });

    outputChannel.appendLine(``);
    outputChannel.appendLine(`Extensions Ignored:`);

    if (!ignoredExtensions || ignoredExtensions.length === 0) {
      outputChannel.appendLine(`  No extensions ignored.`);
    } else {
      ignoredExtensions.forEach(extn => {
        outputChannel.appendLine(`  ${extn.name} v${extn.version}`);
      });
    }

    outputChannel.appendLine(``);
    outputChannel.appendLine(`Extensions Removed:`);

    if (!syncSettings.extConfig.removeExtensions) {
      outputChannel.appendLine(`  Feature Disabled.`);
    } else {
      if (!removedExtensions || removedExtensions.length === 0) {
        outputChannel.appendLine(`  No extensions removed.`);
      } else {
        removedExtensions.forEach(extn => {
          outputChannel.appendLine(`  ${extn.name} v${extn.version}`);
        });
      }
    }

    if (addedExtensions) {
      outputChannel.appendLine(``);
      outputChannel.appendLine(`Extensions Added:`);

      if (addedExtensions.length === 0) {
        outputChannel.appendLine(`  No extensions installed.`);
      }

      addedExtensions.forEach(extn => {
        outputChannel.appendLine(`  ${extn.name} v${extn.version}`);
      });
    }

    outputChannel.appendLine(`--------------------`);
    outputChannel.append(`Done.`);
    outputChannel.show(true);
  }
}
