"use strict";
import * as fs from "fs-extra";
import * as vscode from "vscode";

import Commons from "./commons";
import { Environment } from "./environmentPath";
import localize from "./localize";
import * as lockfile from "./lockfile";
import { File, FileService } from "./service/fileService";
import { GitHubService } from "./service/githubService";
import { CustomSettings, ExtensionConfig, LocalConfig } from "./setting";

import { GistSyncService } from "./service/gistSyncService";
import { ExtensionInformation, PluginService } from "./service/pluginService";
import {
  DownloadResponse,
  ISyncService,
  UploadResponse
} from "./service/syncService";

let globalCommonService: Commons;

export class Sync {
  constructor(private context: vscode.ExtensionContext) {}
  /**
   * Run when extension have been activated
   */
  public async bootstrap(): Promise<void> {
    const env = new Environment(this.context);
    globalCommonService = new Commons(env, this.context);
    // if lock file not exist
    // then create it
    if (!(await FileService.FileExists(env.FILE_SYNC_LOCK))) {
      await fs.close(await fs.open(env.FILE_SYNC_LOCK, "w"));
    }

    // if is locked;
    if (await lockfile.Check(env.FILE_SYNC_LOCK)) {
      await lockfile.Unlock(env.FILE_SYNC_LOCK);
    }

    await globalCommonService.StartMigrationProcess();
    const startUpSetting = await globalCommonService.GetSettings();
    const startUpCustomSetting = await globalCommonService.GetCustomSettings();

    if (startUpSetting) {
      const tokenAvailable: boolean =
        startUpCustomSetting.token != null && startUpCustomSetting.token !== "";
      const gistAvailable: boolean =
        startUpSetting.gist != null && startUpSetting.gist !== "";

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
                await globalCommonService.HandleStartWatching();
                return;
              }
            });
        } else {
          if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
            await globalCommonService.HandleStartWatching();
            return;
          }
        }
      }
    }
  }
  /**
   * Upload setting to github gist
   */
  public async upload(): Promise<void> {
    // @ts-ignore
    const args = arguments;
    const env = new Environment(this.context);
    let syncService: ISyncService = null;
    let localConfig: LocalConfig = new LocalConfig();
    const dateNow = new Date();
    await globalCommonService.HandleStopWatching();

    try {
      localConfig = await globalCommonService.InitalizeSettings(true, false);
      localConfig.publicGist = false;
      if (args.length > 0) {
        if (args[0] === "publicGIST") {
          localConfig.publicGist = true;
        }
      }

      syncService = new GistSyncService(env, globalCommonService);
      await syncService.connect(
        localConfig.customConfig.token,
        localConfig.customConfig.githubEnterpriseUrl
      );
      await startGitProcess(localConfig.extConfig, localConfig.customConfig);
    } catch (error) {
      Commons.LogException(error, globalCommonService.ERROR_MESSAGE, true);
      return;
    }

    async function startGitProcess(
      syncSetting: ExtensionConfig,
      customSettings: CustomSettings
    ) {
      vscode.window.setStatusBarMessage(
        localize("cmd.updateSettings.info.uploading"),
        2000
      );

      if (customSettings.downloadPublicGist) {
        if (customSettings.token == null || customSettings.token === "") {
          vscode.window.showInformationMessage(
            localize("cmd.updateSettings.warning.noToken")
          );

          return;
        }
      }

      customSettings.lastUpload = dateNow;
      vscode.window.setStatusBarMessage(
        localize("cmd.updateSettings.info.readding"),
        2000
      );

      let ignoredExtensions: ExtensionInformation[] = [];
      let uploadedExtensions: ExtensionInformation[] = [];

      if (syncSetting.syncExtensions) {
        const extensionList: ExtensionInformation[] = PluginService.CreateExtensionList();
        [
          uploadedExtensions,
          ignoredExtensions
        ] = await PluginService.FilterExtensions(
          extensionList,
          customSettings.ignoreExtensions
        );

        const extensionFile: File = await PluginService.CreateExtensionFile(
          env,
          uploadedExtensions
        );

        await FileService.WriteFile(
          extensionFile.filePath,
          extensionFile.content
        );
      }

      const res: UploadResponse = await syncService.upload(
        dateNow,
        localConfig
      );

      if (res) {
        try {
          const saved: boolean = await globalCommonService.SaveConfig(
            localConfig
          );
          if (saved) {
            if (res.uploadID) {
              vscode.window.showInformationMessage(
                localize("cmd.updateSettings.info.uploadingDone", res.uploadID)
              );
            }

            if (localConfig.publicGist) {
              vscode.window.showInformationMessage(
                localize("cmd.updateSettings.info.shareGist")
              );
            }

            if (!syncSetting.quietSync) {
              globalCommonService.ShowSummaryOutput(
                true,
                res.updatedFiles,
                null,
                uploadedExtensions,
                ignoredExtensions,
                localConfig
              );
              vscode.window.setStatusBarMessage("").dispose();
            } else {
              vscode.window.setStatusBarMessage("").dispose();
              vscode.window.setStatusBarMessage(
                localize("cmd.updateSettings.info.uploadingSuccess"),
                5000
              );
            }
            if (syncSetting.autoUpload) {
              await globalCommonService.HandleStartWatching();
            }
          }
        } catch (err) {
          Commons.LogException(err, globalCommonService.ERROR_MESSAGE, true);
        }
      }
    }
  }
  /**
   * Download setting from github gist
   */
  public async download(): Promise<void> {
    const env = new Environment(this.context);
    let syncService: ISyncService = null;
    let localSettings: LocalConfig = new LocalConfig();
    await globalCommonService.HandleStopWatching();

    try {
      localSettings = await globalCommonService.InitalizeSettings(true, true);

      syncService = new GistSyncService(env, globalCommonService);
      await syncService.connect(
        localSettings.customConfig.token,
        localSettings.customConfig.githubEnterpriseUrl
      );

      await StartDownload(localSettings.extConfig);
    } catch (err) {
      Commons.LogException(err, globalCommonService.ERROR_MESSAGE, true);
      return;
    }

    async function StartDownload(syncSetting: ExtensionConfig) {
      vscode.window.setStatusBarMessage("").dispose();
      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.readdingOnline"),
        2000
      );

      const res: DownloadResponse = await syncService.download(localSettings);

      if (res) {
        const saved: boolean = await globalCommonService.SaveConfig(
          localSettings
        );
        if (saved) {
          if (!syncSetting.quietSync) {
            globalCommonService.ShowSummaryOutput(
              false,
              res.updatedFiles,
              res.deletedExtensions,
              res.addedExtensions,
              null,
              localSettings
            );
            const message = await vscode.window.showInformationMessage(
              localize("common.prompt.restartCode"),
              "Yes"
            );

            if (message === "Yes") {
              vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
            vscode.window.setStatusBarMessage("").dispose();
          } else {
            vscode.window.setStatusBarMessage("").dispose();
            vscode.window.setStatusBarMessage(
              localize("cmd.downloadSettings.info.downloaded"),
              5000
            );
          }
          if (syncSetting.autoUpload) {
            globalCommonService.autoUploadService.StartWatching();
          }
        } else {
          vscode.window.showErrorMessage(
            localize("cmd.downloadSettings.error.unableSave")
          );
        }
        if (syncSetting.autoUpload) {
          await globalCommonService.HandleStartWatching();
        }
      } else {
        vscode.window.showErrorMessage(
          localize("cmd.downloadSettings.error.unableSave")
        );
      }
    }
  }
  /**
   * Reset the setting to Sync
   */
  public async reset(): Promise<void> {
    let extSettings: ExtensionConfig = null;
    let localSettings: CustomSettings = null;

    vscode.window.setStatusBarMessage(
      localize("cmd.resetSettings.info.resetting"),
      2000
    );

    try {
      const env: Environment = new Environment(this.context);
      const common: Commons = new Commons(env, this.context);

      extSettings = new ExtensionConfig();
      localSettings = new CustomSettings();

      const extSaved: boolean = await common.SaveSettings(extSettings);
      const customSaved: boolean = await common.SetCustomSettings(
        localSettings
      );
      const lockExist: boolean = await FileService.FileExists(
        env.FILE_SYNC_LOCK
      );

      if (!lockExist) {
        fs.closeSync(fs.openSync(env.FILE_SYNC_LOCK, "w"));
      }

      // check is sync locking
      if (await lockfile.Check(env.FILE_SYNC_LOCK)) {
        await lockfile.Unlock(env.FILE_SYNC_LOCK);
      }

      if (extSaved && customSaved) {
        vscode.window.showInformationMessage(
          localize("cmd.resetSettings.info.settingClear")
        );
      }
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
    const env: Environment = new Environment(this.context);
    const common: Commons = new Commons(env, this.context);
    const setting: ExtensionConfig = await common.GetSettings();
    const customSettings: CustomSettings = await common.GetCustomSettings();
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
      customSettings.token != null && customSettings.token !== "";
    const gistAvailable: boolean = setting.gist != null && setting.gist !== "";

    const items: string[] = [
      "cmd.otherOptions.editLocalSetting",
      "cmd.otherOptions.shareSetting",
      "cmd.otherOptions.downloadSetting",
      "cmd.otherOptions.toggleForceDownload",
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

    const handlerMap = {
      0: async () => {
        const file: vscode.Uri = vscode.Uri.file(env.FILE_CUSTOMIZEDSETTINGS);
        fs.openSync(file.fsPath, "r");
        const document = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(
          document,
          vscode.ViewColumn.One,
          true
        );
      },
      1: async () => {
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
          customSettings.downloadPublicGist = false;
          await common.SetCustomSettings(customSettings);
        }
      },
      2: async () => {
        // Download Settings from Public GIST
        selectedItem = 2;
        customSettings.downloadPublicGist = true;
        settingChanged = true;
        await common.SetCustomSettings(customSettings);
      },
      3: async () => {
        // toggle force download
        selectedItem = 3;
        settingChanged = true;
        setting.forceDownload = !setting.forceDownload;
      },
      4: async () => {
        // toggle auto upload
        selectedItem = 4;
        settingChanged = true;
        setting.autoUpload = !setting.autoUpload;
      },
      5: async () => {
        // auto download on startup
        selectedItem = 5;
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
      6: async () => {
        // page summary toggle
        selectedItem = 6;
        settingChanged = true;

        if (!tokenAvailable || !gistAvailable) {
          vscode.commands.executeCommand("extension.HowSettings");
          return;
        }
        setting.quietSync = !setting.quietSync;
      },
      7: async () => {
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
          const done: boolean = await common.SetCustomSettings(customSettings);
          if (done) {
            vscode.window.showInformationMessage(
              localize("cmd.otherOptions.customizedSync.done", fileName)
            );
          }
        }
      },
      8: async () => {
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
      9: async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk"
          )
        );
      },
      10: async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://github.com/shanalikhan/code-settings-sync/issues/new"
          )
        );
      },
      11: async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html"
          )
        );
      }
    };

    try {
      await handlerMap[index]();
      if (settingChanged) {
        if (selectedItem === 1) {
          await globalCommonService.HandleStopWatching();
        }
        await common
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
                  const message = setting.autoUpload
                    ? "cmd.otherOptions.toggleAutoUpload.on"
                    : "cmd.otherOptions.toggleAutoUpload.off";
                  return vscode.window.showInformationMessage(
                    localize(message)
                  );
                },
                5: async () => {
                  const message = setting.autoDownload
                    ? "cmd.otherOptions.toggleAutoDownload.on"
                    : "cmd.otherOptions.toggleAutoDownload.off";
                  return vscode.window.showInformationMessage(
                    localize(message)
                  );
                },
                6: async () => {
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
    customSettings: CustomSettings,
    syncSetting: ExtensionConfig
  ): Promise<File[]> {
    const github = new GitHubService();
    await github.Authenticate(
      customSettings.token,
      customSettings.githubEnterpriseUrl
    );
    const res = await github.ReadGist(syncSetting.gist);
    if (!res) {
      Commons.LogException(res, "Sync : Unable to Read Gist.", true);
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
