"use strict";
import { FSWatcher, watch } from "chokidar";
import * as fs from "fs-extra";
import * as vscode from "vscode";
import { Environment } from "./environmentPath";
import localize from "./localize";
import * as lockfile from "./lockfile";
import { AutoUploadService } from "./service/autoUploadService";
import { File, FileService } from "./service/fileService";
import { ExtensionInformation } from "./service/pluginService";
import { CustomSettings, ExtensionConfig, LocalConfig } from "./setting";
import { Util } from "./util";

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

  private configWatcher: FSWatcher;
  private autoUploadService = new AutoUploadService({
    watcher: this.configWatcher,
    en: this.en,
    commons: this
  });

  constructor(
    private en: Environment,
    private context: vscode.ExtensionContext
  ) {}

  public async StartWatch(): Promise<void> {
    const lockExist: boolean = await FileService.FileExists(
      this.en.FILE_SYNC_LOCK
    );
    if (!lockExist) {
      fs.closeSync(fs.openSync(this.en.FILE_SYNC_LOCK, "w"));
    }

    // check is sync locking
    if (await lockfile.Check(this.en.FILE_SYNC_LOCK)) {
      await lockfile.Unlock(this.en.FILE_SYNC_LOCK);
    }

    this.autoUploadService.StopWatching();
    this.configWatcher = watch(`${this.en.PATH}/User/`, {
      ignoreInitial: true,
      depth: 2
    });
    this.autoUploadService.StartWatching();
  }

  public async InitiateAutoUpload(): Promise<boolean> {
    vscode.window.setStatusBarMessage("").dispose();
    vscode.window.setStatusBarMessage(
      localize("common.info.initAutoUpload"),
      5000
    );

    await Util.Sleep(3000);

    vscode.commands.executeCommand("extension.updateSettings", "forceUpdate");

    return true;
  }

  public CloseWatch(): void {
    if (this.autoUploadService) {
      this.autoUploadService.StopWatching();
    }
  }

  public OpenSettingsPage() {
    //
  }

  public InitalizeSettings(): LocalConfig {
    const settings = new LocalConfig();
    const extSettings = this.GetSettings();
    const cusSettings = this.GetCustomSettings();

    if (!cusSettings.method) {
      this.OpenSettingsPage();
    }

    settings.customConfig = cusSettings;
    settings.extConfig = extSettings;
    return settings;
  }

  public GetCustomSettings(): CustomSettings {
    const customSettings: CustomSettings = new CustomSettings();
    try {
      const customExist: boolean = FileService.FileExists(
        this.en.FILE_CUSTOMIZEDSETTINGS
      );
      if (customExist) {
        const customSettingStr: string = FileService.ReadFile(
          this.en.FILE_CUSTOMIZEDSETTINGS
        );
        const tempObj: {
          [key: string]: any;
          ignoreUploadSettings: string[];
        } = JSON.parse(customSettingStr);
        if (!Array.isArray(tempObj.ignoreUploadSettings)) {
          tempObj.ignoreUploadSettings = [];
        }
        Object.assign(customSettings, tempObj);
        customSettings.gistSettings.token = customSettings.gistSettings.token.trim();
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
        JSON.stringify(json)
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

  public SaveSettings(setting: ExtensionConfig): boolean {
    const config = vscode.workspace.getConfiguration("sync");
    const allKeysUpdated = new Array<Thenable<void>>();

    const keys = Object.keys(setting);
    keys.forEach(keyName => {
      if (setting[keyName] == null) {
        setting[keyName] = "";
      }
      if (keyName.toLowerCase() !== "token") {
        if (config.get(keyName) !== setting[keyName]) {
          allKeysUpdated.push(config.update(keyName, setting[keyName], true));
        }
      }
    });

    try {
      Promise.all(allKeysUpdated);
      if (this.context.globalState.get("syncCounter")) {
        const counter = this.context.globalState.get("syncCounter");
        let count: number = parseInt(counter + "", 10);
        if (count % 450 === 0) {
          this.DonateMessage();
        }
        count = count + 1;
        this.context.globalState.update("syncCounter", count);
      } else {
        this.context.globalState.update("syncCounter", 1);
      }
      return true;
    } catch (err) {
      Commons.LogException(err, this.ERROR_MESSAGE, true);
      return false;
    }
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

  public GetSettings(): ExtensionConfig {
    const settings = new ExtensionConfig();

    for (const key of Object.keys(settings)) {
      if (key !== "token") {
        settings[key] = vscode.workspace.getConfiguration("sync").get(key);
      }
    }

    settings.gist = settings.gist.trim();
    return settings;
  }

  public async AskForInput(options: vscode.InputBoxOptions): Promise<string> {
    return ((await vscode.window.showInputBox(options)) || "").trim();
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
    outputChannel.appendLine(`GitHub Gist: ${syncSettings.extConfig.gist}`);
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

    if (!syncSettings.extConfig.removeExtensions) {
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
