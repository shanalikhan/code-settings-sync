"use strict";
import { openSync, readFileSync } from "fs";
import { has, set } from "lodash";
import * as vscode from "vscode";
import { Environment } from "./environmentPath";
import localize from "./localize";
import { AutoUploadService } from "./service/autoUploadService";
import { File, FileService } from "./service/fileService";
import { GitHubOAuthService } from "./service/oauthService";
import { ExtensionInformation } from "./service/pluginService";
import { CustomSettings, ExtensionConfig, LocalConfig } from "./setting";

enum SettingType {
  TextInput,
  Checkbox,
  TextArea
}

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
          //  message = error.message;
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

  public static GetInputBox(token: boolean) {
    if (token) {
      const options: vscode.InputBoxOptions = {
        placeHolder: localize("common.placeholder.enterGithubAccessToken"),
        password: false,
        prompt: localize("common.prompt.enterGithubAccessToken"),
        ignoreFocusOut: true
      };
      return options;
    } else {
      const options: vscode.InputBoxOptions = {
        placeHolder: localize("common.placeholder.enterGistId"),
        password: false,
        prompt: localize("common.prompt.enterGistId"),
        ignoreFocusOut: true
      };
      return options;
    }
  }

  public SettingsView: string;
  public LandingPageView: string;

  public autoUploadService: AutoUploadService;

  public ERROR_MESSAGE: string = localize("common.error.message");

  private customizableSettings = [
    {
      name: "Hostname (optional)",
      placeholder: "Enter Hostname",
      type: SettingType.TextInput,
      correspondingSetting: "hostName"
    },
    {
      name: "Ignored Files",
      placeholder: "Enter one file per line",
      type: SettingType.TextArea,
      correspondingSetting: "ignoreUploadFiles"
    },
    {
      name: "Ignored Folders",
      placeholder: "Enter one folder per line",
      type: SettingType.TextArea,
      correspondingSetting: "ignoreUploadFolders"
    },
    {
      name: "Ignored Extensions",
      placeholder: "Enter one extension per line (full name)",
      type: SettingType.TextArea,
      correspondingSetting: "ignoreExtensions"
    },
    {
      name: "Supported File Extensions",
      placeholder: "Enter one file extension per line",
      type: SettingType.TextArea,
      correspondingSetting: "supportedFileExtensions"
    },
    {
      name: "Access Token",
      placeholder: "Enter Token",
      type: SettingType.TextInput,
      correspondingSetting: "token"
    },
    {
      name: "Gist Description",
      placeholder: "Enter Gist Description",
      type: SettingType.TextInput,
      correspondingSetting: "gistDescription"
    },
    {
      name: "GitHub Enterprise URL (optional)",
      placeholder: "Enter GitHub Enterprise URL",
      type: SettingType.TextInput,
      correspondingSetting: "githubEnterpriseUrl"
    },
    {
      name: "Ask Gist Name",
      placeholder: "",
      type: SettingType.Checkbox,
      correspondingSetting: "askGistName"
    },
    {
      name: "Download Public Gist",
      placeholder: "",
      type: SettingType.Checkbox,
      correspondingSetting: "downloadPublicGist"
    },
    {
      name: "Open Token Link",
      placeholder: "",
      type: SettingType.Checkbox,
      correspondingSetting: "openTokenLink"
    }
  ];

  private extensionSettings = [
    {
      name: "Gist ID",
      placeholder: "Enter Gist ID",
      type: SettingType.TextInput,
      correspondingSetting: "gist"
    },
    {
      name: "Auto Download",
      placeholder: "",
      type: SettingType.Checkbox,
      correspondingSetting: "autoDownload"
    },
    {
      name: "Auto Upload",
      placeholder: "",
      type: SettingType.Checkbox,
      correspondingSetting: "autoUpload"
    },
    {
      name: "Force Download",
      placeholder: "",
      type: SettingType.Checkbox,
      correspondingSetting: "forceDownload"
    },
    {
      name: "Quiet Sync",
      placeholder: "",
      type: SettingType.Checkbox,
      correspondingSetting: "quietSync"
    },
    {
      name: "Remove Extensions",
      placeholder: "",
      type: SettingType.Checkbox,
      correspondingSetting: "removeExtensions"
    },
    {
      name: "Sync Extensions",
      placeholder: "",
      type: SettingType.Checkbox,
      correspondingSetting: "syncExtensions"
    }
  ];

  constructor(
    private en: Environment,
    private context: vscode.ExtensionContext
  ) {
    this.InitializeAutoUpload();
    this.SettingsView = readFileSync(
      `${this.context.extensionPath}/ui/settings/settings.html`,
      {
        encoding: "utf8"
      }
    );
    this.LandingPageView = readFileSync(
      `${this.context.extensionPath}/ui/landing-page/landing-page.html`,
      {
        encoding: "utf8"
      }
    );
  }

  public async OpenSettingsPage() {
    const customSettings = await this.GetCustomSettings();
    const extSettings = await this.GetSettings();
    const content: string = this.SettingsView.replace(
      new RegExp("@GLOBAL_DATA", "g"),
      JSON.stringify(customSettings)
    )
      .replace(new RegExp("@ENV_DATA", "g"), JSON.stringify(extSettings))
      .replace(
        new RegExp("@GLOBAL_MAP", "g"),
        JSON.stringify(this.customizableSettings)
      )
      .replace(
        new RegExp("@ENV_MAP", "g"),
        JSON.stringify(this.extensionSettings)
      )
      .replace(
        new RegExp("@PWD", "g"),
        vscode.Uri.file(this.context.extensionPath)
          .with({
            scheme: "vscode-resource"
          })
          .toString()
      );
    const settingsPanel = vscode.window.createWebviewPanel(
      "syncSettings",
      "Sync Settings",
      vscode.ViewColumn.One,
      {
        retainContextWhenHidden: true,
        enableScripts: true
      }
    );
    settingsPanel.webview.html = content;
    settingsPanel.webview.onDidReceiveMessage(message =>
      this.ReceiveSettingChange(message)
    );
  }

  public async ReceiveSettingChange(message: {
    command: string;
    text: string;
    type: string;
  }) {
    let value: any = message.text;
    if (message.text === "true" || message.text === "false") {
      value = message.text === "true";
    }
    if (message.type === "global") {
      const customSettings = await this.GetCustomSettings();
      if (has(customSettings, message.command)) {
        set(customSettings, message.command, value);
        this.SetCustomSettings(customSettings);
      }
    } else {
      const extSettings = await this.GetSettings();
      extSettings[message.command] = message.text;
      this.SaveSettings(extSettings);
    }
  }

  public async OpenLandingPage() {
    const releaseNotes = require("../release-notes.json");
    const content: string = this.LandingPageView.replace(
      new RegExp("@PWD", "g"),
      vscode.Uri.file(this.context.extensionPath)
        .with({
          scheme: "vscode-resource"
        })
        .toString()
    ).replace("@RELEASE_NOTES", JSON.stringify(releaseNotes));
    const landingPanel = vscode.window.createWebviewPanel(
      "landingPage",
      "Welcome to Settings Sync",
      vscode.ViewColumn.One,
      {
        retainContextWhenHidden: true,
        enableScripts: true
      }
    );
    landingPanel.webview.html = content;
    landingPanel.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case "loginWithGitHub":
          new GitHubOAuthService(54321, this).StartProcess();
          vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse(
              "https://github.com/login/oauth/authorize?scope=gist%20read:user&client_id=cfd96460d8b110e2351b&redirect_uri=http://localhost:54321/callback"
            )
          );
          break;
        case "editConfiguration":
          const file: vscode.Uri = vscode.Uri.file(
            this.en.FILE_CUSTOMIZEDSETTINGS
          );
          openSync(file.fsPath, "r");
          const document = await vscode.workspace.openTextDocument(file);
          await vscode.window.showTextDocument(
            document,
            vscode.ViewColumn.One,
            true
          );
          break;
      }
    });
  }

  public async InitializeAutoUpload() {
    const ignored = await AutoUploadService.GetIgnoredItems(
      await this.GetCustomSettings()
    );
    this.autoUploadService = new AutoUploadService({
      en: this.en,
      commons: this,
      ignored
    });
  }

  public async InitalizeSettings(): Promise<LocalConfig> {
    const settings: LocalConfig = new LocalConfig();
    const extSettings: ExtensionConfig = this.GetSettings();
    const cusSettings: CustomSettings = await this.GetCustomSettings();

    if (cusSettings.token === "" || extSettings.gist === "") {
      this.OpenLandingPage();
    }

    settings.customConfig = cusSettings;
    settings.extConfig = extSettings;
    return settings;
  }

  public async GetCustomSettings(): Promise<CustomSettings> {
    let customSettings: CustomSettings = new CustomSettings();
    try {
      const customExist: boolean = await FileService.FileExists(
        this.en.FILE_CUSTOMIZEDSETTINGS
      );
      if (customExist) {
        const customSettingStr: string = await FileService.ReadFile(
          this.en.FILE_CUSTOMIZEDSETTINGS
        );
        const tempObj = JSON.parse(customSettingStr);

        Object.assign(customSettings, tempObj);
        customSettings.token = customSettings.token.trim();
        return customSettings;
      }
    } catch (e) {
      Commons.LogException(
        e,
        "Sync : Unable to read " +
          this.en.FILE_CUSTOMIZEDSETTINGS_NAME +
          ". Make sure its Valid JSON.",
        true
      );
      vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.parse(
          "http://shanalikhan.github.io/2017/02/19/Option-to-ignore-settings-folders-code-settings-sync.html"
        )
      );
      customSettings = null;
      return customSettings;
    }
  }

  public async SetCustomSettings(setting: CustomSettings): Promise<boolean> {
    try {
      await FileService.WriteFile(
        this.en.FILE_CUSTOMIZEDSETTINGS,
        JSON.stringify(setting, null, 4)
      );
      return true;
    } catch (e) {
      Commons.LogException(
        e,
        "Sync : Unable to write " + this.en.FILE_CUSTOMIZEDSETTINGS_NAME,
        true
      );
      return false;
    }
  }

  public async StartMigrationProcess(): Promise<boolean> {
    const fileExist: boolean = await FileService.FileExists(
      this.en.FILE_CUSTOMIZEDSETTINGS
    );
    let customSettings: CustomSettings = null;
    const firstTime: boolean = !fileExist;
    let fileChanged: boolean = firstTime;

    if (fileExist) {
      customSettings = await this.GetCustomSettings();
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
      // #TODO : Remove this in new update
      const newIgnoredList = new CustomSettings().ignoreUploadFiles;
      newIgnoredList.forEach(m => {
        if (customSettings.ignoreUploadFiles.indexOf(m) === -1) {
          customSettings.ignoreUploadFiles.push(m);
        }
      });

      if (this.context.globalState.get("synctoken")) {
        const token = this.context.globalState.get("synctoken");
        if (token !== "") {
          customSettings.token = String(token);
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
      await this.SetCustomSettings(customSettings);
    }
    return true;
  }

  public async SaveSettings(setting: ExtensionConfig): Promise<boolean> {
    const config = vscode.workspace.getConfiguration("sync");
    const allKeysUpdated = new Array<Thenable<void>>();

    const keys = Object.keys(setting);
    keys.forEach(async keyName => {
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
      await Promise.all(allKeysUpdated);
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

  public async DonateMessage(): Promise<void> {
    const donateNow = localize("common.action.donate");
    const writeReview = localize("common.action.writeReview");
    const res = await vscode.window.showInformationMessage(
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

  /**
   * IgnoreSettings
   */
  public async GetIgnoredSettings(settings: string[]): Promise<object> {
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

    await Promise.all(keysUpdated);

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
      `GitHub Token: ${syncSettings.customConfig.token || "Anonymous"}`
    );
    outputChannel.appendLine(`GitHub Gist: ${syncSettings.extConfig.gist}`);
    outputChannel.appendLine(
      `GitHub Gist Type: ${syncSettings.publicGist ? "Public" : "Secret"}`
    );
    outputChannel.appendLine(``);
    if (!syncSettings.customConfig.token) {
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
