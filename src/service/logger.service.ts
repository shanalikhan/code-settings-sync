import { OutputChannel, window } from "vscode";
import { Environment } from "../environment";
import { LocalConfig } from "../models/localConfig.model";
import { state } from "../state";
import { File } from "./file.service";
import { ExtensionInformation } from "./plugin.service";

export class LoggerService {
  public static outputChannel: OutputChannel;

  public static defaultError: string;

  public static LogException(
    error: any,
    message: string,
    showMessageBox: boolean
  ): void {
    if (error) {
      console.error(error);
      if (error.status === 500) {
        message = state.localize("common.error.connection");
        showMessageBox = false;
      } else if (error.status === 401) {
        showMessageBox = true;
        message = state.localize("common.error.invalidToken");
      } else if (error.status === 4) {
        message = state.localize("common.error.canNotSave");
      } else if (error.message) {
        try {
          message = JSON.parse(error.message).message;
          if (message.toLowerCase() === "not found") {
            showMessageBox = true;
            message = state.localize("common.error.invalidGistId");
          }
        } catch (error) {
          //  message = error.message;
        }
      }
    }

    if (showMessageBox === true) {
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
      LoggerService.outputChannel = window.createOutputChannel(
        "Code Settings Sync"
      );
    }

    const outputChannel = LoggerService.outputChannel;
    outputChannel.appendLine(
      `CODE SETTINGS SYNC ${upload ? "UPLOAD" : "DOWNLOAD"} SUMMARY`
    );
    outputChannel.appendLine(`Version: ${Environment.version}`);
    outputChannel.appendLine(`--------------------`);
    outputChannel.appendLine(
      `GitHub Token: ${syncSettings.customConfig.GitHubGist.token ||
        "Anonymous"}`
    );
    outputChannel.appendLine(`GitHub Gist: ${syncSettings.extConfig.gist}`);
    outputChannel.appendLine(
      `GitHub Gist Type: ${syncSettings.publicGist ? "Public" : "Secret"}`
    );
    outputChannel.appendLine(``);
    if (!syncSettings.customConfig.GitHubGist.token) {
      outputChannel.appendLine(
        `Anonymous Gist cannot be edited, the extension will always create a new one during upload.`
      );
    }
    outputChannel.appendLine(
      `Restarting Visual Studio Code may be required to apply color and file icon theme.`
    );
    outputChannel.appendLine(`--------------------`);

    outputChannel.appendLine(`Files ${upload ? "Upload" : "Download"}ed:`);
    files
      .filter(item => item.fileName.indexOf(".") > 0)
      .forEach(item => {
        outputChannel.appendLine(`  ${item.fileName} > ${item.gistName}`);
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
