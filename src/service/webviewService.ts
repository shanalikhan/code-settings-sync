import { readFileSync } from "fs-extra";
import { has, set } from "lodash";
import * as vscode from "vscode";
import Commons from "../commons";
import localize from "../localize";
import { UISettingType } from "../models/settingType.model";
import { IWebview } from "../models/webview.model";
import { CustomSettings, ExtensionConfig } from "../setting";
import { GitHubOAuthService } from "./oauthService";

export class WebviewService {
  private customizableSettings = [
    {
      name: "Access Token",
      placeholder: "Enter Token",
      type: UISettingType.TextInput,
      correspondingSetting: "token"
    },
    {
      name: "GitHub Enterprise URL (optional)",
      placeholder: "Enter GitHub Enterprise URL",
      type: UISettingType.TextInput,
      correspondingSetting: "githubEnterpriseUrl"
    },

    {
      name: "Ignored Folders",
      placeholder: "Enter one folder per line",
      type: UISettingType.TextArea,
      correspondingSetting: "ignoreUploadFolders"
    },
    {
      name: "Ignored Extensions",
      placeholder: "Enter one extension per line (full name)",
      type: UISettingType.TextArea,
      correspondingSetting: "ignoreExtensions"
    },
    {
      name: "Hostname (optional)",
      placeholder: "Enter Hostname",
      type: UISettingType.TextInput,
      correspondingSetting: "hostName"
    },
    {
      name: "Ignored Files",
      placeholder: "Enter one file per line",
      type: UISettingType.TextArea,
      correspondingSetting: "ignoreUploadFiles"
    },
    {
      name: "Supported File Extensions",
      placeholder: "Enter one file extension per line",
      type: UISettingType.TextArea,
      correspondingSetting: "supportedFileExtensions"
    },

    {
      name: "Gist Description",
      placeholder: "Enter Gist Description",
      type: UISettingType.TextInput,
      correspondingSetting: "gistDescription"
    },

    {
      name: "Ask Gist Name",
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "askGistName"
    },
    {
      name: "Download Public Gist",
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "downloadPublicGist"
    },
    {
      name: "Open Token Link",
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "openTokenLink"
    }
  ];

  private extensionSettings = [
    {
      name: "Gist ID",
      placeholder: "Enter Gist ID",
      type: UISettingType.TextInput,
      correspondingSetting: "gist",
      tooltip: localize("ext.config.gist")
    },
    {
      name: "Auto Download",
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "autoDownload",
      tooltip: localize("ext.config.autoDownload")
    },
    {
      name: "Auto Upload",
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "autoUpload",
      tooltip: localize("ext.config.autoUpload")
    },
    {
      name: "Force Download",
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "forceDownload",
      tooltip: localize("ext.config.forceDownload")
    },
    {
      name: "Quiet Sync",
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "quietSync",
      tooltip: localize("ext.config.quietSync")
    },
    {
      name: "Remove Extensions",
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "removeExtensions",
      tooltip: localize("ext.config.removeExtensions")
    },
    {
      name: "Sync Extensions",
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "syncExtensions",
      tooltip: localize("ext.config.syncExtensions")
    }
  ];

  private webviews: IWebview[] = [
    {
      name: "landing-page",
      htmlPath: "landing-page.html",
      replaceables: [
        {
          find: "@RELEASE_NOTES",
          replace: "releaseNotes"
        }
      ]
    },
    {
      name: "settings",
      htmlPath: "settings.html",
      replaceables: [
        {
          find: "@GLOBAL_DATA",
          replace: "customSettings"
        },
        {
          find: "@ENV_DATA",
          replace: "extSettings"
        },
        {
          find: "@GLOBAL_MAP",
          replace: this.customizableSettings
        },
        {
          find: "@ENV_MAP",
          replace: this.extensionSettings
        }
      ]
    },
    {
      name: "gist-selection",
      htmlPath: "gist-selection.html",
      replaceables: [
        {
          find: "@GISTS",
          replace: "gists"
        }
      ]
    }
  ];

  constructor(private commons: Commons, private searchFolder: string) {
    this.webviews = this.webviews.map(view => {
      return {
        ...view,
        htmlContent: readFileSync(
          `${this.searchFolder}/ui/${view.name}/${view.htmlPath}`,
          "utf-8"
        )
      };
    });
  }

  public OpenSettingsPage(
    customSettings: CustomSettings,
    extSettings: ExtensionConfig
  ): vscode.WebviewPanel {
    const webview = this.webviews[1];
    const content: string = this.GenerateContent({
      content: webview.htmlContent,
      items: webview.replaceables,
      customSettings,
      extSettings
    });
    if (webview.webview) {
      webview.webview.webview.html = content;
      webview.webview.reveal();
      return webview.webview;
    }
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
    settingsPanel.webview.onDidReceiveMessage(message => {
      this.ReceiveSettingChange(message, customSettings, extSettings);
    });
    webview.webview = settingsPanel;
    settingsPanel.onDidDispose(() => (webview.webview = null));
    return settingsPanel;
  }

  public UpdateSettingsPage(
    customSettings: CustomSettings,
    extSettings: ExtensionConfig
  ) {
    const webview = this.webviews[1];
    if (webview.webview) {
      webview.webview.webview.html = this.GenerateContent({
        content: webview.htmlContent,
        items: webview.replaceables,
        customSettings,
        extSettings
      });
    }
  }

  public ReceiveSettingChange(
    message: {
      command: string;
      text: string;
      type: string;
    },
    customSettings: CustomSettings,
    extSettings: ExtensionConfig
  ) {
    let value: any = message.text;
    if (message.text === "true" || message.text === "false") {
      value = message.text === "true";
    }
    if (message.type === "global") {
      if (has(customSettings, message.command)) {
        set(customSettings, message.command, value);
        this.commons.SetCustomSettings(customSettings);
      }
    } else {
      extSettings[message.command] = value;
      this.commons.SaveSettings(extSettings);
    }
  }

  public OpenLandingPage() {
    const webview = this.webviews[0];
    const releaseNotes = require("../../release-notes.json");
    const content: string = this.GenerateContent({
      content: webview.htmlContent,
      items: webview.replaceables,
      releaseNotes
    });
    if (webview.webview) {
      webview.webview.webview.html = content;
      webview.webview.reveal();
      return webview;
    }
    const landingPanel = vscode.window.createWebviewPanel(
      "landingPage",
      "Welcome to Settings Sync",
      vscode.ViewColumn.One,
      {
        retainContextWhenHidden: true,
        enableScripts: true
      }
    );
    landingPanel.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case "loginWithGitHub":
          new GitHubOAuthService(
            54321,
            this.commons,
            this.searchFolder
          ).StartProcess();
          vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse(
              "https://github.com/login/oauth/authorize?scope=gist%20read:user&client_id=cfd96460d8b110e2351b&redirect_uri=http://localhost:54321/callback"
            )
          );
          break;
        case "editConfiguration":
          this.OpenSettingsPage(
            await this.commons.GetCustomSettings(),
            await this.commons.GetSettings()
          );
          break;
      }
    });
    landingPanel.webview.html = content;
    webview.webview = landingPanel;
    landingPanel.onDidDispose(() => (webview.webview = null));
    return landingPanel;
  }

  public OpenGistSelectionpage(gists: any) {
    const webview = this.webviews[2];
    const content: string = this.GenerateContent({
      content: webview.htmlContent,
      items: webview.replaceables,
      gists
    });
    if (webview.webview) {
      webview.webview.webview.html = content;
      webview.webview.reveal();
      return webview;
    }
    const gistSelectionPanel = vscode.window.createWebviewPanel(
      "selectGist",
      "Select Your Existing Gist",
      vscode.ViewColumn.One,
      {
        retainContextWhenHidden: true,
        enableScripts: true
      }
    );
    gistSelectionPanel.webview.html = content;
    gistSelectionPanel.webview.onDidReceiveMessage(async message => {
      if (!message.close) {
        const extSettings = await this.commons.GetSettings();
        extSettings.gist = message.id;
        this.commons.SaveSettings(extSettings);
      } else {
        gistSelectionPanel.dispose();
      }
    });
    webview.webview = gistSelectionPanel;
    gistSelectionPanel.onDidDispose(() => (webview.webview = null));
    return gistSelectionPanel;
  }

  private GenerateContent(options: any) {
    const toReplace: Array<{}> = [];
    options.items.forEach(option => {
      if (typeof option.replace === "string") {
        let str = "";
        switch (option.replace) {
          case "releaseNotes":
            str = JSON.stringify(options.releaseNotes);
            break;
          case "customSettings":
            str = JSON.stringify(options.customSettings);
            break;
          case "extSettings":
            str = JSON.stringify(options.extSettings);
            break;
          case "gists":
            str = JSON.stringify(options.gists);
            break;
        }
        toReplace.push({ ...option, replace: str });
      } else {
        toReplace.push({
          find: option.find,
          replace: JSON.stringify(option.replace)
        });
      }
    });
    return toReplace
      .reduce(
        (acc, cur: any) => acc.replace(new RegExp(cur.find, "g"), cur.replace),
        options.content
      )
      .replace(
        new RegExp("@PWD", "g"),
        vscode.Uri.file(this.searchFolder)
          .with({
            scheme: "vscode-resource"
          })
          .toString()
      );
  }
}
