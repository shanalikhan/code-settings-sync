import * as fs from "fs-extra";
import * as vscode from "vscode";

import Commons from "./commons";
import { SyncMethod } from "./enums/syncMethod.enum";
import localize from "./localize";
import { CustomConfig } from "./models/customConfig.model";
import { ExtensionConfig } from "./models/extensionConfig.model";
import { ISyncService } from "./models/ISyncService.model";
import { LocalConfig } from "./models/localConfig.model";
import { FactoryService } from "./service/factory.service";
import { File, FileService } from "./service/file.service";
import { GitHubService } from "./service/github/github.service";
import * as lockfile from "./service/watcher/lockfile";
import { WatcherService } from "./service/watcher/watcher.service";
import { state } from "./state";

export class Sync {
  /**
   * Run when extension have been activated
   */
  public async bootstrap(): Promise<void> {
    state.commons = new Commons(state);
    state.watcher = new WatcherService(state);

    await state.commons.StartMigrationProcess();
    const startUpSetting = await state.commons.GetSettings();
    const startUpCustomSetting = await state.commons.GetCustomSettings();

    if (startUpSetting) {
      const tokenAvailable: boolean =
        startUpCustomSetting.githubSettings.token != null &&
        startUpCustomSetting.githubSettings.token !== "";
      const gistAvailable: boolean =
        startUpSetting.gist != null && startUpSetting.gist !== "";

      if (
        !startUpCustomSetting.githubSettings.gistSettings.downloadPublicGist &&
        !tokenAvailable
      ) {
        if (state.commons.webviewService.IsLandingPageEnabled()) {
          state.commons.webviewService.OpenLandingPage();
          return;
        }
      }

      if (gistAvailable) {
        if (startUpSetting.autoDownload) {
          vscode.commands
            .executeCommand("extension.downloadSettings")
            .then(async () => {
              if (
                startUpSetting.autoUpload &&
                tokenAvailable &&
                gistAvailable
              ) {
                await state.watcher.HandleStartWatching();
                return;
              }
            });
        } else {
          if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
            await state.watcher.HandleStartWatching();
            return;
          }
        }
      }
    }
  }
  /**
   * Upload setting to github gist
   */
  public async upload(optArgument?: string): Promise<void> {
    // @ts-ignore
    // const args = arguments;
    try {
      const service: ISyncService = FactoryService.CreateSyncService(
        state,
        SyncMethod.GitHubGist
      );
      const args = new Array<string>();
      if (optArgument && optArgument === "publicGIST") {
        args.push("publicGIST");
      }
      service.Export(args);
    } catch (err) {
      Commons.LogException(err, state.commons.ERROR_MESSAGE, true);
      return;
    }
  }
  /**
   * Download setting from github gist
   */
  public async download(): Promise<void> {
    try {
      const service: ISyncService = FactoryService.CreateSyncService(
        state,
        SyncMethod.GitHubGist
      );
      service.Import();
    } catch (err) {
      Commons.LogException(err, state.commons.ERROR_MESSAGE, true);
      return;
    }
  }
  /**
   * Reset the setting to Sync
   */
  public async reset(): Promise<void> {
    let extSettings: ExtensionConfig = null;
    let localSettings: CustomConfig = null;

    vscode.window.setStatusBarMessage(
      localize("cmd.resetSettings.info.resetting"),
      2000
    );

    try {
      extSettings = new ExtensionConfig();
      localSettings = new CustomConfig();

      await Promise.all([
        state.context.globalState.update("landingPage.dontShowThisAgain", false)
      ]);

      const [extSaved, customSaved, lockExist] = await Promise.all([
        state.commons.SaveSettings(extSettings),
        state.commons.SetCustomSettings(localSettings),
        FileService.FileExists(state.environment.FILE_SYNC_LOCK)
      ]);

      if (!lockExist) {
        fs.closeSync(fs.openSync(state.environment.FILE_SYNC_LOCK, "w"));
      }

      // check is sync locking
      if (await lockfile.Check(state.environment.FILE_SYNC_LOCK)) {
        await lockfile.Unlock(state.environment.FILE_SYNC_LOCK);
      }

      if (extSaved && customSaved) {
        vscode.window.showInformationMessage(
          localize("cmd.resetSettings.info.settingClear")
        );
      }

      state.commons.webviewService.UpdateSettingsPage(
        localSettings,
        extSettings
      );
    } catch (err) {
      Commons.LogException(
        err,
        "Sync : Unable to clear settings. Error Logged on console. Please open an issue.",
        true
      );
    }
  }
  public async how() {
    return vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(
        "http://shanalikhan.github.io/2015/12/15/Visual-Studio-Code-Sync-Settings.html"
      )
    );
  }
  public async advance() {
    const setting: ExtensionConfig = await state.commons.GetSettings();
    const customSettings: CustomConfig = await state.commons.GetCustomSettings();
    if (customSettings == null) {
      vscode.window
        .showInformationMessage(
          localize("cmd.otherOptions.triggerReset"),
          localize("common.button.yes")
        )
        .then(val => {
          if (val === localize("common.button.yes")) {
            vscode.commands.executeCommand("extension.resetSettings");
          }
        });
    }
    const localSetting: LocalConfig = new LocalConfig();
    const tokenAvailable: boolean =
      customSettings.githubSettings.token != null &&
      customSettings.githubSettings.token !== "";
    const gistAvailable: boolean = setting.gist != null && setting.gist !== "";

    const items: string[] = [
      "cmd.otherOptions.openSettingsPage",
      "cmd.otherOptions.editLocalSetting",
      "cmd.otherOptions.shareSetting",
      "cmd.otherOptions.downloadSetting",
      "cmd.otherOptions.toggleForceDownload",
      "cmd.otherOptions.toggleForceUpload",
      "cmd.otherOptions.toggleAutoUpload",
      "cmd.otherOptions.toggleAutoDownload",
      "cmd.otherOptions.toggleSummaryPage",
      "cmd.otherOptions.customizedSync",
      "cmd.otherOptions.downloadCustomFile",
      "cmd.otherOptions.joinCommunity",
      "cmd.otherOptions.openIssue",
      "cmd.otherOptions.releaseNotes"
    ].map(localize);

    let selectedItem: number = 0;
    let settingChanged: boolean = false;

    const item = await vscode.window.showQuickPick(items);

    // if not pick anyone, do nothing
    if (!item) {
      return;
    }

    const index = items.findIndex(v => v === item);

    const handlerMap = [
      async () => {
        state.commons.webviewService.OpenSettingsPage(customSettings, setting);
      },
      async () => {
        const file: vscode.Uri = vscode.Uri.file(
          state.environment.FILE_CUSTOMIZEDSETTINGS
        );
        fs.openSync(file.fsPath, "r");
        const document = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(
          document,
          vscode.ViewColumn.One,
          true
        );
      },
      async () => {
        // share public gist
        const answer = await vscode.window.showInformationMessage(
          localize("cmd.otherOptions.shareSetting.beforeConfirm"),
          "Yes"
        );

        if (answer === "Yes") {
          localSetting.publicGist = true;
          settingChanged = true;
          setting.gist = "";
          selectedItem = 1;
          customSettings.githubSettings.gistSettings.downloadPublicGist = false;
          await state.commons.SetCustomSettings(customSettings);
        }
      },
      async () => {
        // Download Settings from Public GIST
        selectedItem = 2;
        customSettings.githubSettings.gistSettings.downloadPublicGist = true;
        settingChanged = true;
        await state.commons.SetCustomSettings(customSettings);
      },
      async () => {
        // toggle force download
        selectedItem = 3;
        settingChanged = true;
        setting.forceDownload = !setting.forceDownload;
      },
      async () => {
        // toggle force upload
        selectedItem = 4;
        settingChanged = true;
        setting.forceUpload = !setting.forceUpload;
      },
      async () => {
        // toggle auto upload
        selectedItem = 5;
        settingChanged = true;
        setting.autoUpload = !setting.autoUpload;
      },
      async () => {
        // auto download on startup
        selectedItem = 6;
        settingChanged = true;
        if (!setting) {
          vscode.commands.executeCommand("extension.HowSettings");
          return;
        }
        if (!gistAvailable) {
          vscode.commands.executeCommand("extension.HowSettings");
          return;
        }

        setting.autoDownload = !setting.autoDownload;
      },
      async () => {
        // page summary toggle
        selectedItem = 7;
        settingChanged = true;

        if (!tokenAvailable || !gistAvailable) {
          vscode.commands.executeCommand("extension.HowSettings");
          return;
        }
        setting.quietSync = !setting.quietSync;
      },
      async () => {
        // add customized sync file
        const options: vscode.InputBoxOptions = {
          ignoreFocusOut: true,
          placeHolder: localize("cmd.otherOptions.customizedSync.placeholder"),
          prompt: localize("cmd.otherOptions.customizedSync.prompt")
        };
        const input = await vscode.window.showInputBox(options);

        if (input) {
          const fileName: string = FileService.ExtractFileName(input);
          if (fileName === "") {
            return;
          }
          customSettings.customFiles[fileName] = input;
          const done: boolean = await state.commons.SetCustomSettings(
            customSettings
          );
          if (done) {
            vscode.window.showInformationMessage(
              localize("cmd.otherOptions.customizedSync.done", fileName)
            );
          }
        }
      },
      async () => {
        // Import customized sync file to workspace
        const customFiles = await this.getCustomFilesFromGist(
          customSettings,
          setting
        );
        if (customFiles.length < 1) {
          return;
        }
        const options: vscode.QuickPickOptions = {
          ignoreFocusOut: true,
          placeHolder: localize(
            "cmd.otherOptions.downloadCustomFile.placeholder"
          )
        };
        const fileName = await vscode.window.showQuickPick(
          customFiles.map(file => {
            return file.fileName;
          }),
          options
        );
        // if not pick anyone, do nothing
        if (!fileName) {
          return;
        }
        const selected = customFiles.find(f => {
          return f.fileName === fileName;
        });
        if (selected && vscode.workspace.rootPath) {
          const downloadPath = FileService.ConcatPath(
            vscode.workspace.rootPath,
            selected.fileName
          );
          const done = await FileService.WriteFile(
            downloadPath,
            selected.content
          );
          if (done) {
            vscode.window.showInformationMessage(
              localize("cmd.otherOptions.downloadCustomFile.done", downloadPath)
            );
          }
        }
      },
      async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://join.slack.com/t/codesettingssync/shared_invite/enQtNzQyODMzMzI5MDQ3LWNmZjVkZjE2YTg0MzY1Y2EyYzVmYThmNzg2YjZkNjhhZWY3ZTEzN2I3ZTAxMjkwNWU0ZjMyZGFhMjdiZDI3ODU"
          )
        );
      },
      async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://github.com/shanalikhan/code-settings-sync/issues/new"
          )
        );
      },
      async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html"
          )
        );
      }
    ];

    try {
      await handlerMap[index]();
      if (settingChanged) {
        if (selectedItem === 1) {
          await state.watcher.HandleStopWatching();
        }
        await state.commons
          .SaveSettings(setting)
          .then((added: boolean) => {
            if (added) {
              const callbackMap = {
                1: async () => {
                  return await vscode.commands.executeCommand(
                    "extension.updateSettings",
                    "publicGIST"
                  );
                },
                2: async () => {
                  return await vscode.window.showInformationMessage(
                    localize("cmd.otherOptions.warning.tokenNotRequire")
                  );
                },
                3: async () => {
                  const message = setting.forceDownload
                    ? "cmd.otherOptions.toggleForceDownload.on"
                    : "cmd.otherOptions.toggleForceDownload.off";
                  return vscode.window.showInformationMessage(
                    localize(message)
                  );
                },
                4: async () => {
                  const message = setting.forceUpload
                    ? "cmd.otherOptions.toggleForceUpload.on"
                    : "cmd.otherOptions.toggleForceUpload.off";
                  return vscode.window.showInformationMessage(
                    localize(message)
                  );
                },
                5: async () => {
                  const message = setting.autoUpload
                    ? "cmd.otherOptions.toggleAutoUpload.on"
                    : "cmd.otherOptions.toggleAutoUpload.off";
                  return vscode.window.showInformationMessage(
                    localize(message)
                  );
                },
                6: async () => {
                  const message = setting.autoDownload
                    ? "cmd.otherOptions.toggleAutoDownload.on"
                    : "cmd.otherOptions.toggleAutoDownload.off";
                  return vscode.window.showInformationMessage(
                    localize(message)
                  );
                },
                7: async () => {
                  const message = setting.quietSync
                    ? "cmd.otherOptions.quietSync.on"
                    : "cmd.otherOptions.quietSync.off";
                  return vscode.window.showInformationMessage(
                    localize(message)
                  );
                }
              };

              if (callbackMap[selectedItem]) {
                return callbackMap[selectedItem]();
              }
            } else {
              return vscode.window.showErrorMessage(
                localize("cmd.otherOptions.error.toggleFail")
              );
            }
          })
          .catch(err => {
            Commons.LogException(
              err,
              "Sync : Unable to toggle. Please open an issue.",
              true
            );
          });
      }
    } catch (err) {
      Commons.LogException(err, "Error", true);
      return;
    }
  }

  private async getCustomFilesFromGist(
    customSettings: CustomConfig,
    syncSetting: ExtensionConfig
  ): Promise<File[]> {
    const github = new GitHubService(
      customSettings.githubSettings.token,
      customSettings.githubSettings.enterpriseUrl
    );
    const res = await github.ReadGist(syncSetting.gist);
    if (!res) {
      return [];
    }
    const keys = Object.keys(res.data.files);
    const customFiles: File[] = [];
    keys.forEach(gistName => {
      if (res.data.files[gistName]) {
        if (res.data.files[gistName].content) {
          const prefix = FileService.CUSTOMIZED_SYNC_PREFIX;
          if (gistName.indexOf(prefix) > -1) {
            const fileName = gistName.split(prefix).join(""); // |customized_sync|.htmlhintrc => .htmlhintrc
            const f: File = new File(
              fileName,
              res.data.files[gistName].content,
              fileName in customSettings.customFiles
                ? customSettings.customFiles[fileName]
                : null,
              gistName
            );
            customFiles.push(f);
          }
        }
      }
    });
    return customFiles;
  }
}
