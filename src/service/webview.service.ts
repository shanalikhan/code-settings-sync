import { readFileSync } from "fs-extra";
import { has, set } from "lodash";
import { URL } from "url";
import * as vscode from "vscode";
import { CustomConfig } from "../models/customConfig.model";
import { ExtensionConfig } from "../models/extensionConfig.model";
import { UISettingType } from "../models/settingType.model";
import { IWebviewSetting } from "../models/webview-setting.model";
import { IWebview } from "../models/webview.model";
import { state } from "../state";
import { GitHubOAuthService } from "./github.oauth.service";
import { LoggerService } from "./logger.service";

export class WebviewService {
  private globalSettings: IWebviewSetting[];

  private environmentSettings: IWebviewSetting[];

  private webviews: IWebview[];

  constructor() {
    this.globalSettings = [
      {
        name: state.localization.Localize("ext.globalConfig.token.name"),
        placeholder: state.localization.Localize(
          "ext.globalConfig.token.placeholder"
        ),
        type: UISettingType.TextInput,
        correspondingSetting: "token"
      },
      {
        name: state.localization.Localize(
          "ext.globalConfig.githubEnterpriseUrl.name"
        ),
        placeholder: state.localization.Localize(
          "ext.globalConfig.githubEnterpriseUrl.placeholder"
        ),
        type: UISettingType.TextInput,
        correspondingSetting: "githubEnterpriseUrl"
      },

      {
        name: state.localization.Localize(
          "ext.globalConfig.ignoreUploadFolders.name"
        ),
        placeholder: state.localization.Localize(
          "ext.globalConfig.ignoreUploadFolders.placeholder"
        ),
        type: UISettingType.TextArea,
        correspondingSetting: "ignoreUploadFolders"
      },
      {
        name: state.localization.Localize(
          "ext.globalConfig.ignoreExtensions.name"
        ),
        placeholder: state.localization.Localize(
          "ext.globalConfig.ignoreExtensions.placeholder"
        ),
        type: UISettingType.TextArea,
        correspondingSetting: "ignoreExtensions"
      },
      {
        name: state.localization.Localize("ext.globalConfig.hostName.name"),
        placeholder: state.localization.Localize(
          "ext.globalConfig.hostName.placeholder"
        ),
        type: UISettingType.TextInput,
        correspondingSetting: "hostName"
      },
      {
        name: state.localization.Localize(
          "ext.globalConfig.ignoreUploadFiles.name"
        ),
        placeholder: state.localization.Localize(
          "ext.globalConfig.ignoreUploadFiles.placeholder"
        ),
        type: UISettingType.TextArea,
        correspondingSetting: "ignoreUploadFiles"
      },
      {
        name: state.localization.Localize(
          "ext.globalConfig.supportedFileExtensions.name"
        ),
        placeholder: state.localization.Localize(
          "ext.globalConfig.supportedFileExtensions.placeholder"
        ),
        type: UISettingType.TextArea,
        correspondingSetting: "supportedFileExtensions"
      },
      {
        name: state.localization.Localize(
          "ext.globalConfig.gistDescription.name"
        ),
        placeholder: state.localization.Localize(
          "ext.globalConfig.gistDescription.placeholder"
        ),
        type: UISettingType.TextInput,
        correspondingSetting: "gistDescription"
      },
      {
        name: state.localization.Localize(
          "ext.globalConfig.autoUploadDelay.name"
        ),
        placeholder: state.localization.Localize(
          "ext.globalConfig.autoUploadDelay.placeholder"
        ),
        type: UISettingType.NumberInput,
        correspondingSetting: "autoUploadDelay"
      },
      {
        name: state.localization.Localize("ext.globalConfig.askGistName.name"),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "askGistName"
      },
      {
        name: state.localization.Localize(
          "ext.globalConfig.downloadPublicGist.name"
        ),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "downloadPublicGist"
      },
      {
        name: state.localization.Localize(
          "ext.globalConfig.openTokenLink.name"
        ),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "openTokenLink"
      }
    ];

    this.environmentSettings = [
      {
        name: state.localization.Localize("ext.config.gist.name"),
        placeholder: state.localization.Localize("ext.config.gist.placeholder"),
        type: UISettingType.TextInput,
        correspondingSetting: "gist",
        tooltip: state.localization.Localize("ext.config.gist")
      },
      {
        name: state.localization.Localize("ext.config.autoDownload.name"),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "autoDownload",
        tooltip: state.localization.Localize("ext.config.autoDownload")
      },
      {
        name: state.localization.Localize("ext.config.autoUpload.name"),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "autoUpload",
        tooltip: state.localization.Localize("ext.config.autoUpload")
      },
      {
        name: state.localization.Localize("ext.config.forceDownload.name"),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "forceDownload",
        tooltip: state.localization.Localize("ext.config.forceDownload")
      },
      {
        name: state.localization.Localize("ext.config.forceUpload.name"),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "forceUpload",
        tooltip: state.localization.Localize("ext.config.forceUpload")
      },
      {
        name: state.localization.Localize("ext.config.quietSync.name"),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "quietSync",
        tooltip: state.localization.Localize("ext.config.quietSync")
      },
      {
        name: state.localization.Localize("ext.config.removeExtensions.name"),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "removeExtensions",
        tooltip: state.localization.Localize("ext.config.removeExtensions")
      },
      {
        name: state.localization.Localize("ext.config.syncExtensions.name"),
        placeholder: "",
        type: UISettingType.Checkbox,
        correspondingSetting: "syncExtensions",
        tooltip: state.localization.Localize("ext.config.syncExtensions")
      }
    ];

    this.webviews = [
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
            replace: this.globalSettings
          },
          {
            find: "@ENV_MAP",
            replace: this.environmentSettings
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
    ].map(view => {
      return {
        ...view,
        htmlContent: readFileSync(
          `${state.context.extensionPath}/ui/${view.name}/${view.htmlPath}`,
          "utf-8"
        )
      };
    });
  }

  public OpenSettingsPage(
    customSettings: CustomConfig,
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
    settingsPanel.webview.onDidReceiveMessage(async message => {
      if (message === "openGist") {
        const [customConfig, extConfig] = await Promise.all([
          state.settings.GetCustomSettings(),
          state.settings.GetExtensionSettings()
        ]);
        const host = customConfig.githubEnterpriseUrl
          ? new URL(customConfig.githubEnterpriseUrl)
          : new URL("https://github.com");
        const username = await new GitHubOAuthService(0).getUser(
          customConfig.token,
          host
        );
        if (!username) {
          return LoggerService.LogException(
            null,
            "Sync: Invalid Access Token.",
            true
          );
        }
        vscode.env.openExternal(
          vscode.Uri.parse(
            `https://gist.${host.hostname}/${username}/${extConfig.gist}`
          )
        );
        return;
      }
      this.ReceiveSettingChange(message, customSettings, extSettings);
    });
    webview.webview = settingsPanel;
    settingsPanel.onDidDispose(() => (webview.webview = null));
    return settingsPanel;
  }

  public UpdateSettingsPage(
    customSettings: CustomConfig,
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
    customSettings: CustomConfig,
    extSettings: ExtensionConfig
  ) {
    let value: any = message.text;
    if (message.text === "true" || message.text === "false") {
      value = message.text === "true";
    }
    if (message.type === "global") {
      if (has(customSettings, message.command)) {
        set(customSettings, message.command, value);
        state.settings.SetCustomSettings(customSettings);
      }
    } else {
      extSettings[message.command] = value;
      state.settings.SetExtensionSettings(extSettings);
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
          new GitHubOAuthService(54321).StartProcess();
          const customSettings = await state.settings.GetCustomSettings();
          const host = customSettings.githubEnterpriseUrl
            ? new URL(customSettings.githubEnterpriseUrl)
            : new URL("https://github.com");
          vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse(
              `https://${host.hostname}/login/oauth/authorize?scope=gist%20read:user&client_id=cfd96460d8b110e2351b&redirect_uri=http://localhost:54321/callback`
            )
          );
          break;
        case "editConfiguration":
          this.OpenSettingsPage(
            await state.settings.GetCustomSettings(),
            await state.settings.GetExtensionSettings()
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
        const extSettings = await state.settings.GetExtensionSettings();
        extSettings.gist = message.id;
        state.settings.SetExtensionSettings(extSettings);
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
        toReplace.push({
          ...option,
          replace: JSON.stringify(options[option.replace])
        });
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
        vscode.Uri.file(state.context.extensionPath)
          .with({
            scheme: "vscode-resource"
          })
          .toString()
      );
  }
}
