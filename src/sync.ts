import * as fs from "fs-extra";
import * as vscode from "vscode";

import Commons from "./commons";
import { OsType } from "./enums";
import { Environment } from "./environmentPath";
import localize from "./localize";
import * as lockfile from "./lockfile";
import { File, FileService } from "./service/fileService";
import { GitHubService } from "./service/githubService";
import { ExtensionInformation, PluginService } from "./service/pluginService";
import {
  CloudSetting,
  CustomSettings,
  ExtensionConfig,
  LocalConfig
} from "./setting";

export class Sync {
  constructor(private context: vscode.ExtensionContext) {}
  /**
   * Run when extension have been activated
   */
  public async bootstrap(): Promise<void> {
    const env = new Environment(this.context);
    const globalCommonService = new Commons(env, this.context);
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

      if (gistAvailable === true && startUpSetting.autoDownload === true) {
        vscode.commands
          .executeCommand("extension.downloadSettings")
          .then(() => {
            if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
              return globalCommonService.StartWatch();
            }
          });
      }
      if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
        return globalCommonService.StartWatch();
      }
    }
  }
  /**
   * Upload setting to github gist
   */
  public async upload(): Promise<void> {
    const args = arguments;
    const env = new Environment(this.context);
    const common = new Commons(env, this.context);
    let github: GitHubService = null;
    let localConfig: LocalConfig = new LocalConfig();
    const allSettingFiles: File[] = [];
    let uploadedExtensions: ExtensionInformation[] = [];
    const ignoredExtensions: ExtensionInformation[] = [];
    const dateNow = new Date();
    common.CloseWatch();

    try {
      localConfig = await common.InitalizeSettings(true, false);
      localConfig.publicGist = false;
      if (args.length > 0) {
        if (args[0] === "publicGIST") {
          localConfig.publicGist = true;
        }
      }

      github = new GitHubService(
        localConfig.customConfig.token,
        localConfig.customConfig.githubEnterpriseUrl
      );
      // ignoreSettings = await common.GetIgnoredSettings(localConfig.customConfig.ignoreUploadSettings);
      await startGitProcess(localConfig.extConfig, localConfig.customConfig);
      // await common.SetIgnoredSettings(ignoreSettings);
    } catch (error) {
      Commons.LogException(error, common.ERROR_MESSAGE, true);
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

      // var remoteList = ExtensionInformation.fromJSONList(file.content);
      // var deletedList = PluginService.GetDeletedExtensions(uploadedExtensions);
      if (syncSetting.syncExtensions) {
        uploadedExtensions = PluginService.CreateExtensionList();
        if (
          customSettings.ignoreExtensions &&
          customSettings.ignoreExtensions.length > 0
        ) {
          uploadedExtensions = uploadedExtensions.filter(extension => {
            if (customSettings.ignoreExtensions.includes(extension.name)) {
              ignoredExtensions.push(extension);
              return false;
            }
            return true;
          });
        }
        uploadedExtensions.sort((a, b) => a.name.localeCompare(b.name));
        const extensionFileName = env.FILE_EXTENSION_NAME;
        const extensionFilePath = env.FILE_EXTENSION;
        const extensionFileContent = JSON.stringify(
          uploadedExtensions,
          undefined,
          2
        );
        const extensionFile: File = new File(
          extensionFileName,
          extensionFileContent,
          extensionFilePath,
          extensionFileName
        );
        allSettingFiles.push(extensionFile);
      }

      let contentFiles: File[] = [];
      contentFiles = await FileService.ListFiles(
        env.USER_FOLDER,
        0,
        2,
        customSettings.supportedFileExtensions
      );

      const customExist: boolean = await FileService.FileExists(
        env.FILE_CUSTOMIZEDSETTINGS
      );
      if (customExist) {
        contentFiles = contentFiles.filter(
          contentFile =>
            contentFile.fileName !== env.FILE_CUSTOMIZEDSETTINGS_NAME
        );

        if (customSettings.ignoreUploadFiles.length > 0) {
          contentFiles = contentFiles.filter(contentFile => {
            const isMatch: boolean =
              customSettings.ignoreUploadFiles.indexOf(contentFile.fileName) ===
                -1 && contentFile.fileName !== env.FILE_CUSTOMIZEDSETTINGS_NAME;
            return isMatch;
          });
        }
        if (customSettings.ignoreUploadFolders.length > 0) {
          contentFiles = contentFiles.filter((contentFile: File) => {
            const matchedFolders = customSettings.ignoreUploadFolders.filter(
              folder => {
                return contentFile.filePath.indexOf(folder) === -1;
              }
            );
            return matchedFolders.length > 0;
          });
        }
      } else {
        Commons.LogException(null, common.ERROR_MESSAGE, true);
        return;
      }

      for (const snippetFile of contentFiles) {
        if (
          snippetFile.fileName !== env.APP_SUMMARY_NAME &&
          snippetFile.fileName !== env.FILE_KEYBINDING_MAC
        ) {
          if (snippetFile.content !== "") {
            if (snippetFile.fileName === env.FILE_KEYBINDING_NAME) {
              snippetFile.gistName =
                env.OsType === OsType.Mac
                  ? env.FILE_KEYBINDING_MAC
                  : env.FILE_KEYBINDING_DEFAULT;
            }
            allSettingFiles.push(snippetFile);
          }
        }
      }

      const extProp: CloudSetting = new CloudSetting();
      extProp.lastUpload = dateNow;
      const fileName: string = env.FILE_CLOUDSETTINGS_NAME;
      const fileContent: string = JSON.stringify(extProp);
      const file: File = new File(fileName, fileContent, "", fileName);
      allSettingFiles.push(file);

      let completed: boolean = false;
      let newGIST: boolean = false;
      try {
        if (syncSetting.gist == null || syncSetting.gist === "") {
          if (customSettings.askGistName) {
            customSettings.gistDescription = await common.AskGistName();
          }
          newGIST = true;
          const gistID = await github.CreateEmptyGIST(
            localConfig.publicGist,
            customSettings.gistDescription
          );
          if (gistID) {
            syncSetting.gist = gistID;
            vscode.window.setStatusBarMessage(
              localize("cmd.updateSettings.info.newGistCreated"),
              2000
            );
          } else {
            vscode.window.showInformationMessage(
              localize("cmd.updateSettings.error.newGistCreateFail")
            );
            return;
          }
        }
        let gistObj = await github.ReadGist(syncSetting.gist);
        if (!gistObj) {
          vscode.window.showErrorMessage(
            localize("cmd.updateSettings.error.readGistFail", syncSetting.gist)
          );
          return;
        }

        if (gistObj.data.owner !== null) {
          const gistOwnerName: string = gistObj.data.owner.login.trim();
          if (github.userName != null) {
            const userName: string = github.userName.trim();
            if (gistOwnerName !== userName) {
              Commons.LogException(
                null,
                "Sync : You cant edit GIST for user : " +
                  gistObj.data.owner.login,
                true,
                () => {
                  console.log("Sync : Current User : " + "'" + userName + "'");
                  console.log(
                    "Sync : Gist Owner User : " + "'" + gistOwnerName + "'"
                  );
                }
              );
              return;
            }
          }
        }

        if (gistObj.public === true) {
          localConfig.publicGist = true;
        }

        vscode.window.setStatusBarMessage(
          localize("cmd.updateSettings.info.uploadingFile"),
          3000
        );
        gistObj = github.UpdateGIST(gistObj, allSettingFiles);
        completed = await github.SaveGIST(gistObj.data);
        if (!completed) {
          vscode.window.showErrorMessage(
            localize("cmd.updateSettings.error.gistNotSave")
          );
          return;
        }
      } catch (err) {
        Commons.LogException(err, common.ERROR_MESSAGE, true);
        return;
      }

      if (completed) {
        try {
          const settingsUpdated = await common.SaveSettings(syncSetting);
          const customSettingsUpdated = await common.SetCustomSettings(
            customSettings
          );
          if (settingsUpdated && customSettingsUpdated) {
            if (newGIST) {
              vscode.window.showInformationMessage(
                localize(
                  "cmd.updateSettings.info.uploadingDone",
                  syncSetting.gist
                )
              );
            }

            if (localConfig.publicGist) {
              vscode.window.showInformationMessage(
                localize("cmd.updateSettings.info.shareGist")
              );
            }

            if (!syncSetting.quietSync) {
              common.ShowSummaryOutput(
                true,
                allSettingFiles,
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
              common.StartWatch();
            }
          }
        } catch (err) {
          Commons.LogException(err, common.ERROR_MESSAGE, true);
        }
      }
    }
  }
  /**
   * Download setting from github gist
   */
  public async download(): Promise<void> {
    const env = new Environment(this.context);
    const common = new Commons(env, this.context);
    let localSettings: LocalConfig = new LocalConfig();
    common.CloseWatch();

    try {
      localSettings = await common.InitalizeSettings(true, true);
      await StartDownload(localSettings.extConfig, localSettings.customConfig);
    } catch (err) {
      Commons.LogException(err, common.ERROR_MESSAGE, true);
      return;
    }

    async function StartDownload(
      syncSetting: ExtensionConfig,
      customSettings: CustomSettings
    ) {
      const github = new GitHubService(
        customSettings.token,
        customSettings.githubEnterpriseUrl
      );
      vscode.window.setStatusBarMessage("").dispose();
      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.readdingOnline"),
        2000
      );

      const res = await github.ReadGist(syncSetting.gist);

      if (!res) {
        Commons.LogException(res, "Sync : Unable to Read Gist.", true);
        return;
      }

      let addedExtensions: ExtensionInformation[] = [];
      let deletedExtensions: ExtensionInformation[] = [];
      const ignoredExtensions: string[] =
        customSettings.ignoreExtensions || new Array<string>();
      const updatedFiles: File[] = [];
      const actionList: Array<Promise<void | boolean>> = [];

      if (res.data.public === true) {
        localSettings.publicGist = true;
      }
      const keys = Object.keys(res.data.files);
      if (keys.indexOf(env.FILE_CLOUDSETTINGS_NAME) > -1) {
        const cloudSettGist: object = JSON.parse(
          res.data.files[env.FILE_CLOUDSETTINGS_NAME].content
        );
        const cloudSett: CloudSetting = Object.assign(
          new CloudSetting(),
          cloudSettGist
        );

        const lastUploadStr: string = customSettings.lastUpload
          ? customSettings.lastUpload.toString()
          : "";
        const lastDownloadStr: string = customSettings.lastDownload
          ? customSettings.lastDownload.toString()
          : "";

        let upToDate: boolean = false;
        if (lastDownloadStr !== "") {
          upToDate =
            new Date(lastDownloadStr).getTime() ===
            new Date(cloudSett.lastUpload).getTime();
        }

        if (lastUploadStr !== "") {
          upToDate =
            upToDate ||
            new Date(lastUploadStr).getTime() ===
              new Date(cloudSett.lastUpload).getTime();
        }

        if (!syncSetting.forceDownload) {
          if (upToDate) {
            vscode.window.setStatusBarMessage("").dispose();
            vscode.window.setStatusBarMessage(
              localize("cmd.downloadSettings.info.gotLatestVersion"),
              5000
            );
            return;
          }
        }
        customSettings.lastDownload = cloudSett.lastUpload;
      }

      keys.forEach(gistName => {
        if (res.data.files[gistName]) {
          if (res.data.files[gistName].content) {
            if (gistName.indexOf(".") > -1) {
              if (
                env.OsType === OsType.Mac &&
                gistName === env.FILE_KEYBINDING_DEFAULT
              ) {
                return;
              }
              if (
                env.OsType !== OsType.Mac &&
                gistName === env.FILE_KEYBINDING_MAC
              ) {
                return;
              }
              const f: File = new File(
                gistName,
                res.data.files[gistName].content,
                null,
                gistName
              );
              updatedFiles.push(f);
            }
          }
        } else {
          console.log(gistName + " key in response is empty.");
        }
      });

      for (const file of updatedFiles) {
        let writeFile: boolean = false;
        const content: string = file.content;

        if (content !== "") {
          if (file.gistName === env.FILE_EXTENSION_NAME) {
            if (syncSetting.syncExtensions) {
              if (syncSetting.removeExtensions) {
                try {
                  deletedExtensions = await PluginService.DeleteExtensions(
                    content,
                    env.ExtensionFolder,
                    ignoredExtensions
                  );
                } catch (uncompletedExtensions) {
                  vscode.window.showErrorMessage(
                    localize("cmd.downloadSettings.error.removeExtFail")
                  );
                  deletedExtensions = uncompletedExtensions;
                }
              }
              let outputChannel: vscode.OutputChannel = null;
              if (!syncSetting.quietSync) {
                outputChannel = vscode.window.createOutputChannel(
                  "Code Settings Sync"
                );
                outputChannel.clear();
                outputChannel.appendLine(
                  `CODE SETTINGS SYNC - COMMAND LINE EXTENSION DOWNLOAD SUMMARY`
                );
                outputChannel.appendLine(
                  `Version: ${Environment.getVersion()}`
                );
                outputChannel.appendLine(`--------------------`);
                outputChannel.show();
              }

              try {
                // TODO: Remove Older installation way in next version.
                let useCli = true;
                if (customSettings.useCliBaseInstallation) {
                  const autoUpdate: boolean = vscode.workspace
                    .getConfiguration("extensions")
                    .get("autoUpdate");
                  useCli = autoUpdate;
                } else {
                  useCli = false;
                }

                addedExtensions = await PluginService.InstallExtensions(
                  content,
                  env.ExtensionFolder,
                  useCli,
                  ignoredExtensions,
                  env.OsType,
                  (message: string, dispose: boolean) => {
                    if (!syncSetting.quietSync) {
                      outputChannel.appendLine(message);
                    } else {
                      console.log(message);
                      if (dispose) {
                        vscode.window.setStatusBarMessage(
                          "Sync : " + message,
                          3000
                        );
                      }
                    }
                  }
                );
                if (!syncSetting.quietSync) {
                  outputChannel.clear();
                  outputChannel.dispose();
                }
              } catch (extensions) {
                addedExtensions = extensions;
                if (!syncSetting.quietSync) {
                  outputChannel.clear();
                  outputChannel.dispose();
                }
              }
            }
          } else {
            writeFile = true;
            if (
              file.gistName === env.FILE_KEYBINDING_DEFAULT ||
              file.gistName === env.FILE_KEYBINDING_MAC
            ) {
              let test: string = "";
              env.OsType === OsType.Mac
                ? (test = env.FILE_KEYBINDING_MAC)
                : (test = env.FILE_KEYBINDING_DEFAULT);
              if (file.gistName !== test) {
                writeFile = false;
              }
            }
            if (writeFile) {
              if (file.gistName === env.FILE_KEYBINDING_MAC) {
                file.fileName = env.FILE_KEYBINDING_DEFAULT;
              }
              const filePath: string = await FileService.CreateDirTree(
                env.USER_FOLDER,
                file.fileName
              );

              actionList.push(
                FileService.WriteFile(filePath, content)
                  .then(() => {
                    // TODO : add Name attribute in File and show information message here with name , when required.
                  })
                  .catch(err => {
                    Commons.LogException(err, common.ERROR_MESSAGE, true);
                    return;
                  })
              );
            }
          }
        }
      }

      await Promise.all(actionList);
      const settingsUpdated = await common.SaveSettings(syncSetting);
      const customSettingsUpdated = await common.SetCustomSettings(
        customSettings
      );
      if (settingsUpdated && customSettingsUpdated) {
        if (!syncSetting.quietSync) {
          common.ShowSummaryOutput(
            false,
            updatedFiles,
            deletedExtensions,
            addedExtensions,
            null,
            localSettings
          );
          vscode.window.setStatusBarMessage("").dispose();
        } else {
          vscode.window.setStatusBarMessage("").dispose();
          vscode.window.setStatusBarMessage(
            localize("cmd.downloadSettings.info.downloaded"),
            5000
          );
        }
        if (Object.keys(customSettings.replaceCodeSettings).length > 0) {
          const config = vscode.workspace.getConfiguration();
          const keysDefined: string[] = Object.keys(
            customSettings.replaceCodeSettings
          );
          for (const key of keysDefined) {
            const value: string = customSettings.replaceCodeSettings[key];
            const c: any = value === "" ? undefined : value;
            config.update(key, c, true);
          }
        }
        if (syncSetting.autoUpload) {
          common.StartWatch();
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
      "cmd.otherOptions.preserve",
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
        // preserve
        const options: vscode.InputBoxOptions = {
          ignoreFocusOut: true,
          placeHolder: localize("cmd.otherOptions.preserve.placeholder"),
          prompt: localize("cmd.otherOptions.preserve.prompt")
        };
        const input = await vscode.window.showInputBox(options);

        if (input) {
          const settingKey: string = input;
          const a = vscode.workspace.getConfiguration();
          const val: string = a.get<string>(settingKey);
          customSettings.replaceCodeSettings[input] = val;
          const done: boolean = await common.SetCustomSettings(customSettings);
          if (done) {
            if (val === "") {
              vscode.window.showInformationMessage(
                localize("cmd.otherOptions.preserve.info.done1", input)
              );
            } else {
              vscode.window.showInformationMessage(
                localize("cmd.otherOptions.preserve.info.done1", input, val)
              );
            }
          }
        }
      },
      8: async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk"
          )
        );
      },
      9: async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://github.com/shanalikhan/code-settings-sync/issues/new"
          )
        );
      },
      10: async () => {
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
          common.CloseWatch();
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
}
