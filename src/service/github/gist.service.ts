import * as vscode from "vscode";

import Commons from "../../commons";
import { OsType } from "../../enums/osType.enum";
import localize from "../../localize";
import { CloudSettings } from "../../models/cloudSettings.model";
import { CustomConfig } from "../../models/customConfig.model";
import { ExtensionConfig } from "../../models/extensionConfig.model";
import { ISyncService } from "../../models/ISyncService.model";
import { LocalConfig } from "../../models/localConfig.model";
import { IExtensionState } from "../../models/state.model";
import PragmaUtil from "../../pragmaUtil";
import { File, FileService } from "../file.service";
import {
  ExtensionInformation,
  InstalledExtensionsSummary,
  PluginService
} from "../plugin.service";
import { GitHubService } from "./github.service";

export class GistService implements ISyncService {
  constructor(private state: IExtensionState) {}

  public async Import(optArgument?: any[]): Promise<void> {
    optArgument[0] = null;
    const localSettings: LocalConfig = await this.state.commons.InitalizeSettings();

    if (
      localSettings.customConfig.githubSettings.gistSettings.downloadPublicGist
        ? !localSettings.extConfig.gist
        : !localSettings.customConfig.githubSettings.token ||
          !localSettings.extConfig.gist
    ) {
      this.state.commons.webviewService.OpenLandingPage(
        "extension.downloadSettings"
      );
      return;
    }

    await this.state.watcher.HandleStopWatching();

    try {
      await StartDownload(localSettings.extConfig, localSettings.customConfig);
    } catch (err) {
      Commons.LogException(err, this.state.commons.ERROR_MESSAGE, true);
      return;
    }

    async function StartDownload(
      syncSetting: ExtensionConfig,
      customSettings: CustomConfig
    ) {
      const github = new GitHubService(
        customSettings.githubSettings.token,
        customSettings.githubSettings.enterpriseUrl
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

      let extensionsInstallSummary: InstalledExtensionsSummary;
      let deletedExtensions: ExtensionInformation[] = [];
      const ignoredExtensions: string[] =
        customSettings.ignoreExtensions || new Array<string>();
      const updatedFiles: File[] = [];
      const actionList: Array<Promise<void | boolean>> = [];

      if (res.data.public === true) {
        localSettings.publicGist = true;
      }
      const keys = Object.keys(res.data.files);
      if (keys.indexOf(this.state.environment.FILE_CLOUDSETTINGS_NAME) > -1) {
        const cloudSettGist: object = JSON.parse(
          res.data.files[this.state.environment.FILE_CLOUDSETTINGS_NAME].content
        );
        const cloudSett: CloudSettings = Object.assign(
          new CloudSettings(),
          cloudSettGist
        );

        const lastUploadStr: string = customSettings.githubSettings.gistSettings
          .lastUpload
          ? customSettings.githubSettings.gistSettings.lastUpload.toString()
          : "";
        const lastDownloadStr: string = customSettings.githubSettings
          .gistSettings.lastDownload
          ? customSettings.githubSettings.gistSettings.lastDownload.toString()
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
        customSettings.githubSettings.gistSettings.lastDownload =
          cloudSett.lastUpload;
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
                if (gistName === this.state.environment.FILE_KEYBINDING_MAC) {
                  return;
                }
              } else {
                if (
                  this.state.environment.OsType === OsType.Mac &&
                  gistName === this.state.environment.FILE_KEYBINDING_DEFAULT
                ) {
                  return;
                }
                if (
                  this.state.environment.OsType !== OsType.Mac &&
                  gistName === this.state.environment.FILE_KEYBINDING_MAC
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
          if (file.gistName === this.state.environment.FILE_EXTENSION_NAME) {
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
                  Commons.outputChannel = vscode.window.createOutputChannel(
                    "Code Settings Sync"
                  );
                  Commons.outputChannel.clear();
                  Commons.outputChannel.appendLine(
                    `Realtime Extension Download Summary`
                  );
                  Commons.outputChannel.appendLine(`--------------------`);
                  Commons.outputChannel.show();
                }

                extensionsInstallSummary = await PluginService.InstallExtensions(
                  content,
                  ignoredExtensions,
                  (message: string, dispose: boolean) => {
                    if (!syncSetting.quietSync) {
                      Commons.outputChannel.appendLine(message);
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
              file.gistName ===
                this.state.environment.FILE_KEYBINDING_DEFAULT ||
              file.gistName === this.state.environment.FILE_KEYBINDING_MAC
            ) {
              let test: string = "";
              this.state.environment.OsType === OsType.Mac &&
              !customSettings.universalKeybindings
                ? (test = this.state.environment.FILE_KEYBINDING_MAC)
                : (test = this.state.environment.FILE_KEYBINDING_DEFAULT);
              if (file.gistName !== test) {
                writeFile = false;
              }
            }
            if (writeFile) {
              if (
                file.gistName === this.state.environment.FILE_KEYBINDING_MAC
              ) {
                file.fileName = this.state.environment.FILE_KEYBINDING_DEFAULT;
              }
              let filePath: string = "";
              if (file.filePath !== null) {
                filePath = await FileService.CreateCustomDirTree(file.filePath);
              } else {
                filePath = await FileService.CreateDirTree(
                  this.state.environment.USER_FOLDER,
                  file.fileName
                );
              }

              if (
                file.gistName === this.state.environment.FILE_SETTING_NAME ||
                file.gistName === this.state.environment.FILE_KEYBINDING_MAC ||
                file.gistName === this.state.environment.FILE_KEYBINDING_DEFAULT
              ) {
                const fileExists = await FileService.FileExists(filePath);

                if (fileExists) {
                  const localContent = await FileService.ReadFile(filePath);
                  content = PragmaUtil.processBeforeWrite(
                    localContent,
                    content,
                    this.state.environment.OsType,
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
                    Commons.LogException(
                      err,
                      this.state.commons.ERROR_MESSAGE,
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
      const settingsUpdated = await this.state.commons.SaveSettings(
        syncSetting
      );
      const customSettingsUpdated = await this.state.commons.SetCustomSettings(
        customSettings
      );
      if (settingsUpdated && customSettingsUpdated) {
        if (!syncSetting.quietSync) {
          this.state.commons.ShowSummaryOutput(
            false,
            updatedFiles,
            deletedExtensions,
            extensionsInstallSummary,
            null,
            localSettings
          );
          if (
            deletedExtensions.length > 0 ||
            extensionsInstallSummary.addedExtensions.length > 0
          ) {
            const message = await vscode.window.showInformationMessage(
              localize("common.prompt.restartCode"),
              "Yes"
            );
            if (message === "Yes") {
              vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
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
          await this.state.watcher.HandleStartWatching();
        }
      } else {
        vscode.window.showErrorMessage(
          localize("cmd.downloadSettings.error.unableSave")
        );
      }
    }
  }
  public IsConfigured(optArgument?: any[]): Promise<boolean> {
    optArgument[0] = "aa";
    throw new Error("Method not implemented.");
  }
  public Reset(optArgument?: any[]): Promise<void> {
    optArgument[0] = "aa";
    throw new Error("Method not implemented.");
  }
  public async Export(optArgument?: any[]): Promise<void> {
    let github: GitHubService = null;
    const localConfig = await this.state.commons.InitalizeSettings();
    if (!localConfig.customConfig.githubSettings.token) {
      this.state.commons.webviewService.OpenLandingPage(
        "extension.updateSettings"
      );
      return;
    }
    const allSettingFiles: File[] = [];
    let uploadedExtensions: ExtensionInformation[] = [];
    const ignoredExtensions: ExtensionInformation[] = [];
    const dateNow = new Date();
    await this.state.watcher.HandleStopWatching();
    try {
      localConfig.publicGist = false;
      if (optArgument && optArgument[0] === "publicGIST") {
        localConfig.publicGist = true;
      }
      github = new GitHubService(
        localConfig.customConfig.githubSettings.token,
        localConfig.customConfig.githubSettings.enterpriseUrl
      );
      await startGitProcess.call(
        this,
        localConfig.extConfig,
        localConfig.customConfig
      );
    } catch (error) {
      Commons.LogException(error, this.state.commons.ERROR_MESSAGE, true);
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
      if (customSettings.githubSettings.gistSettings.downloadPublicGist) {
        if (
          customSettings.githubSettings.token == null ||
          customSettings.githubSettings.token === ""
        ) {
          vscode.window.showInformationMessage(
            localize("cmd.updateSettings.warning.noToken")
          );
          return;
        }
      }
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
        const extensionFileName = this.state.environment.FILE_EXTENSION_NAME;
        const extensionFilePath = this.state.environment.FILE_EXTENSION;
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
        this.state.environment.USER_FOLDER,
        customSettings
      );
      const customExist: boolean = await FileService.FileExists(
        this.state.environment.FILE_CUSTOMIZEDSETTINGS
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
        Commons.LogException(null, this.state.commons.ERROR_MESSAGE, true);
        return;
      }
      for (const snippetFile of contentFiles) {
        if (
          snippetFile.fileName !== this.state.environment.FILE_KEYBINDING_MAC
        ) {
          if (snippetFile.content !== "") {
            if (
              snippetFile.fileName ===
              this.state.environment.FILE_KEYBINDING_NAME
            ) {
              snippetFile.gistName =
                this.state.environment.OsType === OsType.Mac &&
                !customSettings.universalKeybindings
                  ? this.state.environment.FILE_KEYBINDING_MAC
                  : this.state.environment.FILE_KEYBINDING_DEFAULT;
            }
            if (
              snippetFile.fileName ===
                this.state.environment.FILE_SETTING_NAME ||
              snippetFile.fileName ===
                this.state.environment.FILE_KEYBINDING_MAC ||
              snippetFile.fileName ===
                this.state.environment.FILE_KEYBINDING_DEFAULT
            ) {
              try {
                const parsedContent = await PragmaUtil.processBeforeUpload(
                  snippetFile.content
                );
                snippetFile.content = parsedContent;
              } catch (e) {
                Commons.LogException(null, e.message, true);
                console.error(e);
                return;
              }
            }
            allSettingFiles.push(snippetFile);
          }
        }
      }
      const extProp = new CloudSettings();
      extProp.lastUpload = dateNow;
      const fileName: string = this.state.environment.FILE_CLOUDSETTINGS_NAME;
      const fileContent: string = JSON.stringify(extProp);
      const file: File = new File(fileName, fileContent, "", fileName);
      allSettingFiles.push(file);
      let completed: boolean = false;
      let newGIST: boolean = false;
      try {
        if (syncSetting.sortAlphabetically) {
          for (const settingFile of allSettingFiles) {
            const content = await FileService.ReadFile(settingFile.fileName);
            const jsonFile = JSON.parse(content);
            const sortedJSONFile = {};
            const sortedData = Object.keys(content).sort();

            sortedData.map(data => (sortedJSONFile[data] = jsonFile[data]));
            await FileService.WriteFile(
              settingFile.fileName,
              JSON.stringify(sortedJSONFile)
            );
          }
        }

        if (syncSetting.gist == null || syncSetting.gist === "") {
          if (customSettings.githubSettings.gistSettings.askGistDescription) {
            customSettings.githubSettings.gistSettings.gistDescription = await this.state.commons.AskGistDescription();
          }
          newGIST = true;
          const gistID = await github.CreateEmptyGIST(
            localConfig.publicGist,
            customSettings.githubSettings.gistSettings.gistDescription
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
        if (gistObj.data.public === true) {
          localConfig.publicGist = true;
        }
        if (
          !allSettingFiles.some(fileToUpload => {
            if (fileToUpload.gistName === "cloudSettings") {
              return false;
            }
            if (!gistObj.data.files[fileToUpload.gistName]) {
              return true;
            }
            if (
              gistObj.data.files[fileToUpload.gistName].content !==
              fileToUpload.content
            ) {
              console.info(`Sync: file ${fileToUpload.gistName} has changed`);
              return true;
            }
          })
        ) {
          // Gist files are the same as the local files.
          if (!localConfig.extConfig.forceUpload) {
            vscode.window.setStatusBarMessage(
              localize("cmd.updateSettings.info.gotLatestVersion"),
              5000
            );
            // Exit early to avoid unneeded upload.
            return;
          }
          // Fall through to upload code for forced upload case.
        } else {
          // Gist files are different from the local files.
          const gistNewer = await github.IsGistNewer(
            syncSetting.gist,
            customSettings.githubSettings.gistSettings.lastDownload
          );
          if (!customSettings.githubSettings.gistSettings.lastDownload) {
            // Unable to compare the last gist upload time with the
            // last download time, so ask user to force upload.
            const message = await vscode.window.showInformationMessage(
              localize("common.prompt.gistForceUpload"),
              localize("common.button.yes"),
              localize("common.button.no")
            );
            if (message !== localize("common.button.yes")) {
              vscode.window.setStatusBarMessage(
                localize("cmd.updateSettings.info.uploadCanceled"),
                3000
              );
              return;
            }
            // Fall through to upload code for one-time forced upload.
          } else if (gistNewer && !localConfig.extConfig.forceUpload) {
            // Last local download is prior to the last gist upload, so
            // the local settings may be out of date.
            const message = await vscode.window.showInformationMessage(
              localize("common.prompt.gistNewer"),
              localize("common.button.yes"),
              localize("common.button.no")
            );
            if (message !== localize("common.button.yes")) {
              vscode.window.setStatusBarMessage(
                localize("cmd.updateSettings.info.uploadCanceled"),
                3000
              );
              return;
            }
            // Fall through to upload code for one-time forced upload.
          }
          // !gistNewer: Last local download is later or the same as last Gist upload,
          // so OK to upload - fall through to upload code below.
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
        Commons.LogException(err, this.state.commons.ERROR_MESSAGE, true);
        return;
      }
      if (completed) {
        try {
          customSettings.githubSettings.gistSettings.lastUpload = dateNow;
          customSettings.githubSettings.gistSettings.lastDownload = dateNow;
          await this.state.commons.SaveSettings(syncSetting);
          await this.state.commons.SetCustomSettings(customSettings);
          if (newGIST) {
            vscode.window.showInformationMessage(
              localize(
                "cmd.updateSettings.info.uploadingDone",
                syncSetting.gist
              )
            );
          }
          if (optArgument && optArgument[0] === "publicGIST") {
            vscode.window.showInformationMessage(
              localize("cmd.updateSettings.info.shareGist")
            );
          }
          if (!syncSetting.quietSync) {
            this.state.commons.ShowSummaryOutput(
              true,
              allSettingFiles,
              null,
              { addedExtensions: uploadedExtensions, failedExtensions: [] },
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
            await this.state.watcher.HandleStartWatching();
          }
        } catch (err) {
          Commons.LogException(err, this.state.commons.ERROR_MESSAGE, true);
        }
      }
    }
  }
}
