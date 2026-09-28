import { readFileSync } from "fs-extra";
import { has, set } from "lodash";
import { URL } from "url";
import * as vscode from "vscode";
import { GitRepositoryService } from "./git/git.service";
import { SyncMethod } from "../enums/syncMethod.enum";
import Commons from "../commons";
import localize from "../localize";
import { CustomConfig } from "../models/customConfig.model";
import { ExtensionConfig } from "../models/extensionConfig.model";
import { UISettingType } from "../models/settingType.model";
import { IWebview } from "../models/webview.model";
import { state } from "../state";
import { GitHubOAuthService } from "./github/github.oauth.service";

export class WebviewService {
  private pendingSettingsMessage: Promise<void> = Promise.resolve();
  private pendingSettingsWrite: Promise<boolean> = Promise.resolve(true);
  private globalSettings = [
    {
      name: "Sync storage",
      placeholder: "",
      type: UISettingType.Select,
      correspondingSetting: "syncMethod"
    },
    {
      name: "Repository provider",
      placeholder: "github or gitlab",
      type: UISettingType.Select,
      correspondingSetting: "gitRepository.provider"
    },
    {
      name: "Provider API URL",
      placeholder: "https://api.github.com or https://gitlab.com/api/v4",
      type: UISettingType.TextInput,
      correspondingSetting: "gitRepository.apiUrl"
    },
    {
      name: "Git repository URL / absolute local repository path",
      placeholder: "Use a dedicated settings repository",
      type: UISettingType.TextInput,
      correspondingSetting: "gitRepository.remote"
    },
    {
      name: "Branch / profile",
      placeholder: "master, office, home",
      type: UISettingType.TextInput,
      correspondingSetting: "gitRepository.branch"
    },
    {
      name: "New private repository name",
      placeholder: "vscode-settings",
      type: UISettingType.TextInput,
      correspondingSetting: "gitRepository.name"
    },
    {
      name: "Repository token (stored locally)",
      placeholder: "Provider token; leave empty for SSH/local repositories",
      type: UISettingType.TextInput,
      correspondingSetting: "gitRepository.token"
    },
    {
      name: localize("ext.globalConfig.token.name"),
      placeholder: localize("ext.globalConfig.token.placeholder"),
      type: UISettingType.TextInput,
      correspondingSetting: "githubSettings.token"
    },
    {
      name: localize("ext.globalConfig.githubEnterpriseUrl.name"),
      placeholder: localize("ext.globalConfig.githubEnterpriseUrl.placeholder"),
      type: UISettingType.TextInput,
      correspondingSetting: "githubSettings.enterpriseUrl"
    },

    {
      name: localize("ext.globalConfig.ignoreUploadFolders.name"),
      placeholder: localize("ext.globalConfig.ignoreUploadFolders.placeholder"),
      type: UISettingType.TextArea,
      correspondingSetting: "ignoreUploadFolders"
    },
    {
      name: localize("ext.globalConfig.ignoreExtensions.name"),
      placeholder: localize("ext.globalConfig.ignoreExtensions.placeholder"),
      type: UISettingType.TextArea,
      correspondingSetting: "ignoreExtensions"
    },
    {
      name: localize("ext.globalConfig.hostName.name"),
      placeholder: localize("ext.globalConfig.hostName.placeholder"),
      type: UISettingType.TextInput,
      correspondingSetting: "hostName"
    },
    {
      name: localize("ext.globalConfig.ignoreUploadFiles.name"),
      placeholder: localize("ext.globalConfig.ignoreUploadFiles.placeholder"),
      type: UISettingType.TextArea,
      correspondingSetting: "ignoreUploadFiles"
    },
    {
      name: localize("ext.globalConfig.supportedFileExtensions.name"),
      placeholder: localize(
        "ext.globalConfig.supportedFileExtensions.placeholder"
      ),
      type: UISettingType.TextArea,
      correspondingSetting: "supportedFileExtensions"
    },
    {
      name: localize("ext.globalConfig.gistDescription.name"),
      placeholder: localize("ext.globalConfig.gistDescription.placeholder"),
      type: UISettingType.TextInput,
      correspondingSetting: "githubSettings.gistSettings.gistDescription"
    },
    {
      name: localize("ext.globalConfig.autoUploadDelay.name"),
      placeholder: localize("ext.globalConfig.autoUploadDelay.placeholder"),
      type: UISettingType.NumberInput,
      correspondingSetting: "autoUploadDelay"
    },
    {
      name: localize("ext.globalConfig.askGistDescription.name"),
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "githubSettings.gistSettings.askGistDescription"
    },
    {
      name: localize("ext.globalConfig.downloadPublicGist.name"),
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "githubSettings.gistSettings.downloadPublicGist"
    },
    {
      name: localize("ext.globalConfig.openTokenLink.name"),
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "githubSettings.openTokenLink"
    }
  ];

  private environmentSettings = [
    {
      name: localize("ext.config.gist.name"),
      placeholder: localize("ext.config.gist.placeholder"),
      type: UISettingType.TextInput,
      correspondingSetting: "gist",
      tooltip: localize("ext.config.gist")
    },
    {
      name: localize("ext.config.autoDownload.name"),
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "autoDownload",
      tooltip: localize("ext.config.autoDownload")
    },
    {
      name: localize("ext.config.autoUpload.name"),
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "autoUpload",
      tooltip: localize("ext.config.autoUpload")
    },
    {
      name: localize("ext.config.forceDownload.name"),
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "forceDownload",
      tooltip: localize("ext.config.forceDownload")
    },
    {
      name: localize("ext.config.forceUpload.name"),
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "forceUpload",
      tooltip: localize("ext.config.forceUpload")
    },
    {
      name: localize("ext.config.quietSync.name"),
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "quietSync",
      tooltip: localize("ext.config.quietSync")
    },
    {
      name: localize("ext.config.removeExtensions.name"),
      placeholder: "",
      type: UISettingType.Checkbox,
      correspondingSetting: "removeExtensions",
      tooltip: localize("ext.config.removeExtensions")
    },
    {
      name: localize("ext.config.syncExtensions.name"),
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
        },
        {
          find: "@CHECKED",
          replace: "checked"
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
        },
        {
          find: "@SKIP",
          replace: "skip"
        }
      ]
    }
  ];

  constructor() {
    this.webviews = this.webviews.map(view => {
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
    settingsPanel.webview.onDidReceiveMessage(message => {
      this.pendingSettingsMessage = this.pendingSettingsMessage
        .then(async () => {
          if (message === "createRepository") {
            try {
              if (!(await this.pendingSettingsWrite)) {
                throw new Error(
                  "Save the repository settings successfully before creating a repository."
                );
              }
              await new GitRepositoryService(state).CreateRepository();
            } catch (error) {
              Commons.LogException(error, error.message, true);
            }
            return;
          }
          if (message === "openGist") {
            const [customConfig, extConfig] = await Promise.all([
              state.commons.GetCustomSettings(),
              state.commons.GetSettings()
            ]);
            const host = customConfig.githubSettings.enterpriseUrl
              ? new URL(customConfig.githubSettings.enterpriseUrl)
              : new URL("https://github.com");
            const username = await new GitHubOAuthService(0).getUser(
              customConfig.githubSettings.token,
              host
            );
            if (!username) {
              return Commons.LogException(
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
          const currentCustomSettings = await state.commons.GetCustomSettings();
          this.ReceiveSettingChange(
            message,
            currentCustomSettings,
            state.commons.GetSettings()
          );
          await this.pendingSettingsWrite;
        })
        .catch(error => {
          Commons.LogException(error, error.message, true);
        });
      return this.pendingSettingsMessage;
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
    if (
      !message.command.startsWith("gitRepository.") &&
      (message.text === "true" || message.text === "false")
    ) {
      value = message.text === "true";
    }
    if (message.type === "global") {
      if (
        message.command === "syncMethod" &&
        ![SyncMethod.GitHubGist, SyncMethod.GitRepository].includes(value)
      ) {
        return;
      }
      if (
        message.command === "gitRepository.provider" &&
        !["github", "gitlab"].includes(value)
      ) {
        return;
      }
      if (has(customSettings, message.command)) {
        set(customSettings, message.command, value);
        if (message.command === "gitRepository.provider") {
          customSettings.gitRepository.apiUrl =
            value === "github"
              ? "https://api.github.com"
              : "https://gitlab.com/api/v4";
          this.UpdateSettingsPage(customSettings, extSettings);
        }
        this.pendingSettingsWrite = this.pendingSettingsWrite
          .catch(() => false)
          .then(() => state.commons.SetCustomSettings(customSettings));
      }
    } else {
      extSettings[message.command] = value;
      state.commons.SaveSettings(extSettings);
    }
  }

  public IsLandingPageEnabled(): boolean {
    return !state.context.globalState.get<boolean>(
      "landingPage.dontShowThisAgain"
    );
  }

  public OpenLandingPage(cmd?: string) {
    const webview = this.webviews[0];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const releaseNotes = require("../../release-notes.json");
    const content: string = this.GenerateContent({
      content: webview.htmlContent,
      items: webview.replaceables,
      releaseNotes,
      checked: this.IsLandingPageEnabled()
    });
    if (webview.webview) {
      webview.webview.webview.html = content;
      webview.webview.reveal();
      return webview.webview;
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
        case "loginWithGitHub": {
          const customSettings = await state.commons.GetCustomSettings();
          const host = customSettings.githubSettings.enterpriseUrl
            ? new URL(customSettings.githubSettings.enterpriseUrl)
            : new URL("https://github.com");

          const url = `https://${host.hostname}/login/oauth/authorize?scope=gist%20read:user&client_id=cfd96460d8b110e2351b&redirect_uri=http://localhost:54321/callback`;
          new GitHubOAuthService(54321).StartProcess(url, cmd);

          break;
        }
        case "editConfiguration":
          this.OpenSettingsPage(
            await state.commons.GetCustomSettings(),
            state.commons.GetSettings()
          );
          break;
        case "downloadPublicGist": {
          const [extConfig, customConfig] = await Promise.all([
            state.commons.GetSettings(),
            state.commons.GetCustomSettings()
          ]);
          const publicGist = await vscode.window.showInputBox({
            placeHolder: localize("common.placeholder.enterGistId"),
            ignoreFocusOut: true
          });
          if (!publicGist) {
            break;
          }
          customConfig.syncMethod = SyncMethod.GitHubGist;
          customConfig.githubSettings.gistSettings.downloadPublicGist = true;
          await state.commons.SetCustomSettings(customConfig);
          await state.commons.SaveSettings({
            ...extConfig,
            gist: publicGist
          });
          vscode.window.showInformationMessage(
            localize("cmd.otherOptions.warning.tokenNotRequire")
          );
          vscode.commands.executeCommand("extension.downloadSettings");
          break;
        }
        case "dontShowThisAgain":
          await state.context.globalState.update(
            "landingPage.dontShowThisAgain",
            message.data
          );
          break;
      }
    });
    landingPanel.webview.html = content;
    webview.webview = landingPanel;
    landingPanel.onDidDispose(() => (webview.webview = null));
    return landingPanel;
  }

  public OpenGistSelectionpage(gists: any, cmd?: string) {
    const webview = this.webviews[2];
    const content: string = this.GenerateContent({
      content: webview.htmlContent,
      items: webview.replaceables,
      gists,
      skip:
        cmd !== "extension.downloadSettings"
          ? `<a href="#" onclick="vscode.postMessage({close: true});" title="Skip (new one will be created upon first upload)" class="btn btn-primary mt-4">Skip (new one will be created upon first upload)</a>`
          : ""
    });
    if (webview.webview) {
      webview.webview.webview.html = content;
      webview.webview.reveal();
      return webview.webview;
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
        const extSettings = state.commons.GetSettings();
        extSettings.gist = message.id;
        state.commons.SaveSettings(extSettings);
      } else {
        gistSelectionPanel.dispose();
      }
    });
    webview.webview = gistSelectionPanel;
    gistSelectionPanel.onDidDispose(() => {
      webview.webview = null;
      if (cmd) {
        vscode.commands.executeCommand(cmd);
      }
    });
    return gistSelectionPanel;
  }

  private EncodeSettingsData(placeholder: string, value: unknown): string {
    const json = JSON.stringify(value);
    return ["@GLOBAL_DATA", "@ENV_DATA", "@GLOBAL_MAP", "@ENV_MAP"].includes(
      placeholder
    )
      ? encodeURIComponent(json)
      : json;
  }

  private GenerateContent(options: any) {
    const toReplace: Array<Record<string, unknown>> = [];
    options.items.forEach(option => {
      if (typeof option.replace === "string") {
        toReplace.push({
          ...option,
          replace: this.EncodeSettingsData(option.find, options[option.replace])
        });
      } else {
        toReplace.push({
          find: option.find,
          replace: this.EncodeSettingsData(option.find, option.replace)
        });
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return toReplace
      .reduce(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
