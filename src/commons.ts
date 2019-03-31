"use strict";
import { has, set } from "lodash";
import * as vscode from "vscode";
import { Environment } from "./environmentPath";
import localize from "./localize";
import { AutoUploadService } from "./service/autoUploadService";
import { File, FileService } from "./service/fileService";
import { ExtensionInformation } from "./service/pluginService";
import { CustomSettings, LocalConfig } from "./setting";

// tslint:disable-next-line: no-var-requires
const SettingsView = require("html-loader!./ui/settings/settings.html");

export default class Commons {
  public static outputChannel: vscode.OutputChannel = null;
  public static LogException(
    error: any,
    message: string,
    msgBox: boolean,
    callback?: () => void
  ): void {
    if (error) {
      console.error(error);
      if (error.status === 500) {
        message = localize("common.error.connection");
        msgBox = false;
      } else if (error.status === 401) {
        msgBox = true;
        message = localize("common.error.invalidToken");
      } else if (error.status === 4) {
        message = localize("common.error.canNotSave");
      } else if (error.message) {
        try {
          message = JSON.parse(error.message).message;
          if (message.toLowerCase() === "not found") {
            msgBox = true;
            message = localize("common.error.invalidGistId");
          }
        } catch (error) {
          // message = error.message;
        }
      }
    }

    if (msgBox === true) {
      vscode.window.showErrorMessage(message);
      vscode.window.setStatusBarMessage("").dispose();
    } else {
      vscode.window.setStatusBarMessage(message, 5000);
    }

    if (callback) {
      callback.apply(this);
    }
  }

  public ERROR_MESSAGE: string = localize("common.error.message");

  public autoUploadService = new AutoUploadService({
    en: this.en,
    commons: this
  });

  constructor(
    private en: Environment,
    private context: vscode.ExtensionContext
  ) {}

  public OpenSettingsPage() {
    const settingsPanel = vscode.window.createWebviewPanel(
      "syncSettings",
      "Sync Settings",
      vscode.ViewColumn.One,
      {
        retainContextWhenHidden: true,
        enableScripts: true
      }
    );
    const content = SettingsView.replace(
      "@PLACEHOLDER_DATA",
      JSON.stringify(this.GetCustomSettings())
    );
    settingsPanel.webview.html = content;
    settingsPanel.webview.onDidReceiveMessage(message =>
      this.ReceiveSettingChange(message)
    );
  }

  public ReceiveSettingChange(message: { command: string; text: string }) {
    let value: any = message.text;
    if (message.text === "true" || message.text === "false") {
      value = message.text === "true";
    }
    const customSettings = this.GetCustomSettings();
    if (has(customSettings, message.command)) {
      set(customSettings, message.command, value);
    }
    this.SetCustomSettings(customSettings);
  }

  public InitalizeSettings(): LocalConfig {
    const settings = new LocalConfig();
    const cusSettings = this.GetCustomSettings();

    if (!cusSettings.syncMethod) {
      this.OpenSettingsPage();
    }

    settings.customConfig = cusSettings;
    return settings;
  }

  public GetCustomSettings() {
    const customSettings: CustomSettings = new CustomSettings();
    try {
      const customExist = FileService.FileExists(
        this.en.FILE_CUSTOMIZEDSETTINGS
      );
      if (customExist) {
        const customSettingStr = FileService.ReadFile(
          this.en.FILE_CUSTOMIZEDSETTINGS
        );
        const tempObj: {
          [key: string]: any;
        } = JSON.parse(customSettingStr);
        Object.assign(customSettings, tempObj);
        customSettings.gistSettings.token = customSettings.gistSettings.token.trim();
        customSettings.repoSettings.token = customSettings.repoSettings.token.trim();
        return customSettings;
      }
    } catch (e) {
      Commons.LogException(
        e,
        `Sync: Unable to read ${
          this.en.FILE_CUSTOMIZEDSETTINGS_NAME
        }. Make sure its Valid JSON.`,
        true
      );
      this.OpenSettingsPage();
      return null;
    }
  }

  public SetCustomSettings(setting: CustomSettings): boolean {
    try {
      const json: { [key: string]: any } = { ...setting };
      delete json.ignoreUploadSettings;
      FileService.WriteFile(
        this.en.FILE_CUSTOMIZEDSETTINGS,
        JSON.stringify(json, null, 2)
      );
      return true;
    } catch (e) {
      Commons.LogException(
        e,
        `Sync: Unable to write ${this.en.FILE_CUSTOMIZEDSETTINGS_NAME}`,
        true
      );
      return false;
    }
  }

  public StartMigrationProcess(): boolean {
    const fileExist: boolean = FileService.FileExists(
      this.en.FILE_CUSTOMIZEDSETTINGS
    );
    let customSettings: CustomSettings = null;
    const firstTime: boolean = !fileExist;
    let fileChanged: boolean = firstTime;

    if (fileExist) {
      customSettings = this.GetCustomSettings();
    } else {
      customSettings = new CustomSettings();
    }
    // vscode.workspace.getConfiguration().update("sync.version", undefined, true);

    if (firstTime) {
      const openExtensionPage = localize("common.action.openExtPage");
      vscode.window.showInformationMessage(localize("common.info.installed"));
      vscode.window
        .showInformationMessage(
          localize("common.info.needHelp"),
          openExtensionPage
        )
        .then((val: string) => {
          if (val === openExtensionPage) {
            vscode.commands.executeCommand(
              "vscode.open",
              vscode.Uri.parse(
                "https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync"
              )
            );
          }
        });
    } else if (customSettings.version < Environment.CURRENT_VERSION) {
      fileChanged = true;
      if (this.context.globalState.get("synctoken")) {
        const token = this.context.globalState.get("synctoken");
        if (token !== "") {
          customSettings.gistSettings.token = String(token);
          this.context.globalState.update("synctoken", "");
          vscode.window.showInformationMessage(
            localize("common.info.setToken")
          );
        }
      }

      const releaseNotes = localize("common.action.releaseNotes");
      const writeReview = localize("common.action.writeReview");
      const support = localize("common.action.support");
      const joinCommunity = localize("common.action.joinCommunity");
      if (!customSettings.disableUpdateMessage) {
        vscode.window
          .showInformationMessage(
            localize("common.info.updateTo", Environment.getVersion()),
            releaseNotes,
            writeReview,
            support,
            joinCommunity
          )
          .then((val: string) => {
            if (val === releaseNotes) {
              vscode.commands.executeCommand(
                "vscode.open",
                vscode.Uri.parse(
                  "http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html"
                )
              );
            }
            if (val === writeReview) {
              vscode.commands.executeCommand(
                "vscode.open",
                vscode.Uri.parse(
                  "https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync#review-details"
                )
              );
            }
            if (val === support) {
              vscode.commands.executeCommand(
                "vscode.open",
                vscode.Uri.parse(
                  "https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP-DonationsBF:btn_donate_SM.gif:NonHosted"
                )
              );
            }
            if (val === joinCommunity) {
              vscode.commands.executeCommand(
                "vscode.open",
                vscode.Uri.parse(
                  "https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk"
                )
              );
            }
          });
      }
    }

    if (fileChanged) {
      customSettings.version = Environment.CURRENT_VERSION;
      this.SetCustomSettings(customSettings);
    }
    return true;
  }

  public DonateMessage(): void {
    const donateNow = localize("common.action.donate");
    const writeReview = localize("common.action.writeReview");
    const res = vscode.window.showInformationMessage(
      localize("common.info.donate"),
      donateNow,
      writeReview
    );

    if (res === donateNow) {
      vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.parse(
          "https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP-DonationsBF:btn_donate_SM.gif:NonHosted"
        )
      );
    } else if (res === writeReview) {
      vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.parse(
          "https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync#review-details"
        )
      );
    }
  }

  /**
   * IgnoreSettings
   */
  public GetIgnoredSettings(settings: string[]): object {
    const ignoreSettings: object = {};
    const config = vscode.workspace.getConfiguration();
    const keysUpdated: Array<Thenable<void>> = [];

    for (const key of settings) {
      let keyValue: object = null;
      keyValue = config.get<null>(key, null);
      if (keyValue !== null) {
        ignoreSettings[key] = keyValue;
        keysUpdated.push(config.update(key, undefined, true));
      }
    }

    Promise.all(keysUpdated);

    return ignoreSettings;
  }

  /**
   * RestoreIgnoredSettings
   */
  public SetIgnoredSettings(ignoredSettings: object): void {
    const config = vscode.workspace.getConfiguration();
    const keysUpdated: Array<Thenable<void>> = [];
    for (const key of Object.keys(ignoredSettings)) {
      keysUpdated.push(config.update(key, ignoredSettings[key], true));
    }
  }

  /**
   * AskGistName
   */
  public async AskGistName(): Promise<string> {
    return vscode.window.showInputBox({
      prompt: localize("common.prompt.multipleGist"),
      ignoreFocusOut: true,
      placeHolder: localize("common.placeholder.multipleGist")
    });
  }

  public ShowSummaryOutput(
    upload: boolean,
    files: File[],
    removedExtensions: ExtensionInformation[],
    addedExtensions: ExtensionInformation[],
    ignoredExtensions: ExtensionInformation[],
    syncSettings: LocalConfig
  ) {
    if (Commons.outputChannel === null) {
      Commons.outputChannel = vscode.window.createOutputChannel(
        "Code Settings Sync"
      );
    }

    const outputChannel = Commons.outputChannel;
    outputChannel.appendLine(
      `CODE SETTINGS SYNC ${upload ? "UPLOAD" : "DOWNLOAD"} SUMMARY`
    );
    outputChannel.appendLine(`Version: ${Environment.getVersion()}`);
    outputChannel.appendLine(`--------------------`);
    outputChannel.appendLine(
      `GitHub Token: ${syncSettings.customConfig.gistSettings.token ||
        "Anonymous"}`
    );
    outputChannel.appendLine(
      `GitHub Gist: ${syncSettings.customConfig.gistSettings.gist}`
    );
    outputChannel.appendLine(
      `GitHub Gist Type: ${syncSettings.publicGist ? "Public" : "Secret"}`
    );
    outputChannel.appendLine(``);
    if (!syncSettings.customConfig.gistSettings.token) {
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
      .filter(item => item.filename.indexOf(".") > 0)
      .forEach(item => {
        outputChannel.appendLine(`  ${item.filename} > ${item.gistName}`);
      });

    outputChannel.appendLine(``);
    outputChannel.appendLine(`Extensions Ignored:`);

    if (!ignoredExtensions || ignoredExtensions.length === 0) {
      outputChannel.appendLine(`  No extensions ignored.`);
    } else {
      ignoredExtensions.forEach(extn => {
        outputChannel.appendLine(`  ${extn.info.name} v${extn.info.version}`);
      });
    }

    outputChannel.appendLine(``);
    outputChannel.appendLine(`Extensions Removed:`);

    if (!syncSettings.customConfig.removeExtensions) {
      outputChannel.appendLine(`  Feature Disabled.`);
    } else {
      if (!removedExtensions || removedExtensions.length === 0) {
        outputChannel.appendLine(`  No extensions removed.`);
      } else {
        removedExtensions.forEach(extn => {
          outputChannel.appendLine(`  ${extn.info.name} v${extn.info.version}`);
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
        outputChannel.appendLine(`  ${extn.info.name} v${extn.info.version}`);
      });
    }

    outputChannel.appendLine(`--------------------`);
    outputChannel.append(`Done.`);
    outputChannel.show(true);
  }
}
