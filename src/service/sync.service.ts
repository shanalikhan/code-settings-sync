import * as vscode from "vscode";
import localize from "../localize";
import { CloudSettings } from "../models/cloudSettings.model";
import { CustomConfig } from "../models/customConfig.model";
import { ExtensionConfig } from "../models/extensionConfig.model";
import { LocalConfig } from "../models/localConfig.model";
import { OsType } from "../models/os-type.model";
import PragmaUtil from "../pragmaUtil";
import { state } from "../state";
import { File, FileService } from "./file.service";
import { GitHubService } from "./github.service";
import { LoggerService } from "./logger.service";
import { ExtensionInformation, PluginService } from "./plugin.service";

export class SyncService {
  public async UploadSettings(options: string): Promise<void> {
    let github: GitHubService = null;
    let localConfig = new LocalConfig();
    const allSettingFiles: File[] = [];
    let uploadedExtensions: ExtensionInformation[] = [];
    const ignoredExtensions: ExtensionInformation[] = [];
    const currentDate = new Date();
    await state.commons.HandleStopWatching();

    try {
      localConfig = await state.commons.InitalizeSettings();
      localConfig.publicGist = options === "publicGIST";

      github = new GitHubService(
        localConfig.customConfig.token,
        localConfig.customConfig.githubEnterpriseUrl
      );

      if (!localConfig.extConfig.forceUpload) {
        if (
          await github.IsGistNewer(
            localConfig.extConfig.gist,
            new Date(localConfig.customConfig.lastUpload)
          )
        ) {
          const message = await vscode.window.showInformationMessage(
            localize("common.prompt.gistNewer"),
            "Yes"
          );
          if (message === "Yes") {
            localConfig.extConfig.forceUpload = true;
            await state.settings.SetExtensionSettings(localConfig.extConfig);
          } else {
            vscode.window.setStatusBarMessage(
              localize("cmd.updateSettings.info.uploadCanceled"),
              3
            );
            return;
          }
        }
      }

      await startGitProcess.call(
        this,
        localConfig.extConfig,
        localConfig.customConfig
      );
    } catch (error) {
      LoggerService.LogException(error, LoggerService.defaultError, true);
      return;
    }

    async function startGitProcess(
      syncSetting: ExtensionConfig,
      customSettings: CustomConfig
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

      customSettings.lastUpload = currentDate;
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
        const extensionFileName = state.environment.FILE_EXTENSION_NAME;
        const extensionFilePath = state.environment.FILE_EXTENSION;
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

      const contentFiles = await FileService.ListFiles(
        state.environment.USER_FOLDER,
        customSettings
      );

      const customExist: boolean = await FileService.FileExists(
        state.environment.FILE_CUSTOMIZEDSETTINGS
      );
      if (customExist) {
        const customFileKeys: string[] = Object.keys(
          customSettings.customFiles
        );
        if (customFileKeys.length > 0) {
          for (const key of customFileKeys) {
            const val = customSettings.customFiles[key];
            const customFile: File = await FileService.GetCustomFile(val, key);
            if (customFile !== null) {
              allSettingFiles.push(customFile);
            }
          }
        }
      } else {
        LoggerService.LogException(null, LoggerService.defaultError, true);
        return;
      }
      for (const snippetFile of contentFiles) {
        if (snippetFile.fileName !== state.environment.FILE_KEYBINDING_MAC) {
          if (snippetFile.content !== "") {
            if (
              snippetFile.fileName === state.environment.FILE_KEYBINDING_NAME
            ) {
              snippetFile.gistName =
                state.environment.OsType === OsType.Mac &&
                !customSettings.universalKeybindings
                  ? state.environment.FILE_KEYBINDING_MAC
                  : state.environment.FILE_KEYBINDING_DEFAULT;
            }
            if (
              snippetFile.fileName === state.environment.FILE_SETTING_NAME ||
              snippetFile.fileName === state.environment.FILE_KEYBINDING_MAC ||
              snippetFile.fileName === state.environment.FILE_KEYBINDING_DEFAULT
            ) {
              try {
                const parsedContent = await PragmaUtil.processBeforeUpload(
                  snippetFile.content
                );
                snippetFile.content = parsedContent;
              } catch (e) {
                LoggerService.LogException(null, e.message, true);
                console.error(e);
                return;
              }
            }
            allSettingFiles.push(snippetFile);
          }
        }
      }

      const extProp = new CloudSettings();
      extProp.lastUpload = currentDate;
      const fileName: string = state.environment.FILE_CLOUDSETTINGS_NAME;
      const fileContent: string = JSON.stringify(extProp);
      const file: File = new File(fileName, fileContent, "", fileName);
      allSettingFiles.push(file);

      let completed: boolean = false;

      let newGIST: boolean = false;
      try {
        if (syncSetting.gist == null || syncSetting.gist === "") {
          if (customSettings.askGistName) {
            customSettings.gistDescription = await state.commons.AskGistName();
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
          return;
        }

        if (gistObj.data.owner !== null) {
          const gistOwnerName: string = gistObj.data.owner.login.trim();
          if (github.userName != null) {
            const userName: string = github.userName.trim();
            if (gistOwnerName !== userName) {
              LoggerService.LogException(
                null,
                "Sync : You cant edit GIST for user : " + gistOwnerName,
                true
              );
              console.log(`Sync: Current user is '${userName}'`);
              console.log(`Sync: Gist owner is '${gistOwnerName}'`);
              return;
            }
          }
        }

        if (gistObj.data.public === true) {
          localConfig.publicGist = true;
        }

        if (
          !allSettingFiles.some(fileToUpload => {
            if (fileToUpload.fileName === "cloudSettings") {
              return false;
            }
            if (!gistObj.data.files[fileToUpload.fileName]) {
              return true;
            }
            if (
              gistObj.data.files[fileToUpload.fileName].content !==
              fileToUpload.content
            ) {
              console.info(`Sync: file ${fileToUpload.fileName} has changed`);
              return true;
            }
          })
        ) {
          if (!localConfig.extConfig.forceUpload) {
            vscode.window.setStatusBarMessage(
              localize("cmd.updateSettings.info.uploadCanceled"),
              3
            );
            return;
          }
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
        LoggerService.LogException(err, LoggerService.defaultError, true);
        return;
      }

      if (completed) {
        try {
          const settingsUpdated = await state.settings.SetExtensionSettings(
            syncSetting
          );
          const customSettingsUpdated = await state.settings.SetCustomSettings(
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
              state.commons.ShowSummaryOutput(
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
              await state.commons.HandleStartWatching();
            }
          }
        } catch (err) {
          LoggerService.LogException(err, LoggerService.defaultError, true);
        }
      }
    }
  }

  public async DownloadSettings(): Promise<void> {
    let localSettings: LocalConfig = new LocalConfig();
    await state.commons.HandleStopWatching();

    try {
      localSettings = await state.commons.InitalizeSettings();
      await StartDownload(localSettings.extConfig, localSettings.customConfig);
    } catch (err) {
      LoggerService.LogException(err, LoggerService.defaultError, true);
      return;
    }

    async function StartDownload(
      syncSetting: ExtensionConfig,
      customSettings: CustomConfig
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
      if (keys.indexOf(state.environment.FILE_CLOUDSETTINGS_NAME) > -1) {
        const cloudSettGist: object = JSON.parse(
          res.data.files[state.environment.FILE_CLOUDSETTINGS_NAME].content
        );
        const cloudSett: CloudSettings = Object.assign(
          new CloudSettings(),
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
            const prefix = FileService.CUSTOMIZED_SYNC_PREFIX;
            if (gistName.indexOf(prefix) > -1) {
              const fileName = gistName.split(prefix).join(""); // |customized_sync|.htmlhintrc => .htmlhintrc
              if (!(fileName in customSettings.customFiles)) {
                // syncLocalSettings.json > customFiles doesn't have key
                return;
              }
              const f: File = new File(
                fileName,
                res.data.files[gistName].content,
                customSettings.customFiles[fileName],
                gistName
              );
              updatedFiles.push(f);
            } else if (gistName.indexOf(".") > -1) {
              if (customSettings.universalKeybindings) {
                if (gistName === state.environment.FILE_KEYBINDING_MAC) {
                  return;
                }
              } else {
                if (
                  state.environment.OsType === OsType.Mac &&
                  gistName === state.environment.FILE_KEYBINDING_DEFAULT
                ) {
                  return;
                }
                if (
                  state.environment.OsType !== OsType.Mac &&
                  gistName === state.environment.FILE_KEYBINDING_MAC
                ) {
                  return;
                }
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
        let content: string = file.content;

        if (content !== "") {
          if (file.gistName === state.environment.FILE_EXTENSION_NAME) {
            if (syncSetting.syncExtensions) {
              if (syncSetting.removeExtensions) {
                try {
                  deletedExtensions = await PluginService.DeleteExtensions(
                    content,
                    ignoredExtensions
                  );
                } catch (err) {
                  vscode.window.showErrorMessage(
                    localize("cmd.downloadSettings.error.removeExtFail")
                  );
                  throw new Error(err);
                }
              }

              try {
                if (!syncSetting.quietSync) {
                  LoggerService.outputChannel = vscode.window.createOutputChannel(
                    "Code Settings Sync"
                  );
                  LoggerService.outputChannel.clear();
                  LoggerService.outputChannel.appendLine(
                    `Realtime Extension Download Summary`
                  );
                  LoggerService.outputChannel.appendLine(
                    `--------------------`
                  );
                  LoggerService.outputChannel.show();
                }

                addedExtensions = await PluginService.InstallExtensions(
                  content,
                  ignoredExtensions,
                  (message: string, dispose: boolean) => {
                    if (!syncSetting.quietSync) {
                      LoggerService.outputChannel.appendLine(message);
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
              } catch (err) {
                throw new Error(err);
              }
            }
          } else {
            writeFile = true;
            if (
              file.gistName === state.environment.FILE_KEYBINDING_DEFAULT ||
              file.gistName === state.environment.FILE_KEYBINDING_MAC
            ) {
              let test: string = "";
              state.environment.OsType === OsType.Mac &&
              !customSettings.universalKeybindings
                ? (test = state.environment.FILE_KEYBINDING_MAC)
                : (test = state.environment.FILE_KEYBINDING_DEFAULT);
              if (file.gistName !== test) {
                writeFile = false;
              }
            }
            if (writeFile) {
              if (file.gistName === state.environment.FILE_KEYBINDING_MAC) {
                file.fileName = state.environment.FILE_KEYBINDING_DEFAULT;
              }
              let filePath: string = "";
              if (file.filePath !== null) {
                filePath = await FileService.CreateCustomDirTree(file.filePath);
              } else {
                filePath = await FileService.CreateDirTree(
                  state.environment.USER_FOLDER,
                  file.fileName
                );
              }

              if (
                file.gistName === state.environment.FILE_SETTING_NAME ||
                file.gistName === state.environment.FILE_KEYBINDING_MAC ||
                file.gistName === state.environment.FILE_KEYBINDING_DEFAULT
              ) {
                const fileExists = await FileService.FileExists(filePath);

                if (fileExists) {
                  const localContent = await FileService.ReadFile(filePath);
                  content = PragmaUtil.processBeforeWrite(
                    localContent,
                    content,
                    state.environment.OsType,
                    localSettings.customConfig.hostName
                  );
                }
              }

              actionList.push(
                FileService.WriteFile(filePath, content)
                  .then(() => {
                    // TODO : add Name attribute in File and show information message here with name , when required.
                  })
                  .catch(err => {
                    LoggerService.LogException(
                      err,
                      LoggerService.defaultError,
                      true
                    );
                    return;
                  })
              );
            }
          }
        }
      }

      await Promise.all(actionList);
      const settingsUpdated = await state.settings.SetExtensionSettings(
        syncSetting
      );
      const customSettingsUpdated = await state.settings.SetCustomSettings(
        customSettings
      );
      if (settingsUpdated && customSettingsUpdated) {
        if (!syncSetting.quietSync) {
          state.commons.ShowSummaryOutput(
            false,
            updatedFiles,
            deletedExtensions,
            addedExtensions,
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
          await state.commons.HandleStartWatching();
        }
      } else {
        vscode.window.showErrorMessage(
          localize("cmd.downloadSettings.error.unableSave")
        );
      }
    }
  }
}
