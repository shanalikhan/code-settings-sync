import * as GitHubApi from "@octokit/rest";
import * as HttpsProxyAgent from "https-proxy-agent";
import * as vscode from "vscode";
import { CloudSettings } from "../models/cloud-settings.model";
import { CustomConfig } from "../models/custom-config.model";
import { ExtensionConfig } from "../models/extension-config.model";
import { IFixGistResponse } from "../models/fix-gist-response.model";
import { IEnv } from "../models/gist-env.model";
import { LocalConfig } from "../models/local-config.model";
import { OsType } from "../models/os-type.model";
import { ISyncService } from "../models/sync.model";
import PragmaUtil from "../pragmaUtil";
import { state } from "../state";
import { AutoUploadService } from "./autoUpload.service";
import { File, FileService } from "./file.service";
import { LoggerService } from "./logger.service";
import { ExtensionInformation, PluginService } from "./plugin.service";

export class GistService implements ISyncService {
  public id = "gist";

  private githubApi: GitHubApi;
  private emptyGist: any = {
    description: "Visual Studio Code Sync Settings Gist",
    public: false,
    files: {
      "settings.json": {
        content: "// Empty"
      },
      "launch.json": {
        content: "// Empty"
      },
      "keybindings.json": {
        content: "// Empty"
      },
      "extensions.json": {
        content: "// Empty"
      },
      "locale.json": {
        content: "// Empty"
      },
      "keybindingsMac.json": {
        content: "// Empty"
      },
      cloudSettings: {
        content: "// Empty"
      }
    }
  };

  public async UploadSettings(options?: string): Promise<void> {
    let localConfig = new LocalConfig();
    const allSettingFiles: File[] = [];
    let uploadedExtensions: ExtensionInformation[] = [];
    const ignoredExtensions: ExtensionInformation[] = [];
    const currentDate = new Date();
    await AutoUploadService.HandleStopWatching();

    try {
      localConfig = await state.settings.GetLocalConfig();

      await this.Connect();

      if (
        localConfig.extConfig.gist &&
        localConfig.customConfig.GitHubGist.lastUpload &&
        !localConfig.extConfig.forceUpload
      ) {
        if (
          await this.IsGistNewer(
            localConfig.extConfig.gist,
            new Date(localConfig.customConfig.GitHubGist.lastUpload)
          )
        ) {
          const message = await vscode.window.showInformationMessage(
            state.localize("common.prompt.gistNewer"),
            "Yes"
          );
          if (message === "Yes") {
            localConfig.extConfig.forceUpload = true;
            await state.settings.SetExtensionSettings(localConfig.extConfig);
          } else {
            vscode.window.setStatusBarMessage(
              state.localize("cmd.updateSettings.info.uploadCanceled"),
              3
            );
            return;
          }
        }
      }

      await StartUpload.call(
        this,
        localConfig.extConfig,
        localConfig.customConfig
      );
    } catch (error) {
      LoggerService.LogException(error, LoggerService.defaultError, true);
      return;
    }

    async function StartUpload(
      syncSetting: ExtensionConfig,
      customSettings: CustomConfig
    ) {
      vscode.window.setStatusBarMessage(
        state.localize("cmd.updateSettings.info.uploading"),
        2000
      );

      let publicGist = options === "publicGIST";

      if (customSettings.GitHubGist.downloadPublicGist) {
        if (!customSettings.GitHubGist.token) {
          vscode.window.showInformationMessage(
            state.localize("cmd.updateSettings.warning.noToken")
          );

          return;
        }
      }

      customSettings.GitHubGist.lastUpload = currentDate;
      vscode.window.setStatusBarMessage(
        state.localize("cmd.updateSettings.info.readding"),
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
              snippetFile.remoteName =
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
          if (customSettings.GitHubGist.askGistName) {
            customSettings.GitHubGist.gistDescription = await state.commons.AskGistName();
          }
          newGIST = true;
          const gistID = await this.CreateEmptyGIST(
            publicGist,
            customSettings.GitHubGist.gistDescription
          );
          if (gistID) {
            syncSetting.gist = gistID;
            vscode.window.setStatusBarMessage(
              state.localize("cmd.updateSettings.info.newGistCreated"),
              2000
            );
          } else {
            vscode.window.showInformationMessage(
              state.localize("cmd.updateSettings.error.newGistCreateFail")
            );
            return;
          }
        }
        let gistObj = await this.ReadGist(syncSetting.gist);
        if (!gistObj) {
          return;
        }

        if (gistObj.data.owner !== null) {
          const gistOwnerName: string = gistObj.data.owner.login.trim();
          if (this.userName != null) {
            const userName: string = this.userName.trim();
            if (gistOwnerName !== userName) {
              LoggerService.LogException(
                null,
                `Sync : You can't edit a Gist owned by '${gistOwnerName}'`,
                true
              );
              console.log(`Sync: Current user is '${userName}'`);
              console.log(`Sync: Gist owner is '${gistOwnerName}'`);
              return;
            }
          }
        }

        publicGist = gistObj.data.public;

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
              state.localize("cmd.updateSettings.info.uploadCanceled"),
              3
            );
            return;
          }
        }

        vscode.window.setStatusBarMessage(
          state.localize("cmd.updateSettings.info.uploadingFile"),
          3000
        );

        gistObj = this.UpdateGIST(gistObj, allSettingFiles);
        completed = await this.SaveGIST(gistObj.data);
        if (!completed) {
          vscode.window.showErrorMessage(
            state.localize("cmd.updateSettings.error.gistNotSave")
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
                state.localize(
                  "cmd.updateSettings.info.uploadingDone",
                  syncSetting.gist
                )
              );
            }

            if (publicGist) {
              vscode.window.showInformationMessage(
                state.localize("cmd.updateSettings.info.shareGist")
              );
            }

            if (!syncSetting.quietSync) {
              LoggerService.ShowSummaryOutput(
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
                state.localize("cmd.updateSettings.info.uploadingSuccess"),
                5000
              );
            }
            if (syncSetting.autoUpload) {
              await AutoUploadService.HandleStartWatching();
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
    await AutoUploadService.HandleStopWatching();

    try {
      localSettings = await state.settings.GetLocalConfig();
      await StartDownload.call(
        this,
        localSettings.extConfig,
        localSettings.customConfig
      );
    } catch (err) {
      LoggerService.LogException(err, LoggerService.defaultError, true);
      return;
    }

    async function StartDownload(
      syncSetting: ExtensionConfig,
      customSettings: CustomConfig
    ) {
      await this.Connect();
      vscode.window.setStatusBarMessage("").dispose();
      vscode.window.setStatusBarMessage(
        state.localize("cmd.downloadSettings.info.readdingOnline"),
        2000
      );

      const res = await this.ReadGist(syncSetting.gist);

      if (!res) {
        return;
      }

      let addedExtensions: ExtensionInformation[] = [];
      let deletedExtensions: ExtensionInformation[] = [];
      const ignoredExtensions: string[] =
        customSettings.ignoreExtensions || new Array<string>();
      const updatedFiles: File[] = [];
      const actionList: Array<Promise<void | boolean>> = [];

      const keys = Object.keys(res.data.files);
      if (keys.indexOf(state.environment.FILE_CLOUDSETTINGS_NAME) > -1) {
        const cloudSettGist: object = JSON.parse(
          res.data.files[state.environment.FILE_CLOUDSETTINGS_NAME].content
        );
        const cloudSett: CloudSettings = Object.assign(
          new CloudSettings(),
          cloudSettGist
        );

        const lastUploadStr: string = customSettings.GitHubGist.lastUpload
          ? customSettings.GitHubGist.lastUpload.toString()
          : "";
        const lastDownloadStr: string = customSettings.GitHubGist.lastDownload
          ? customSettings.GitHubGist.lastDownload.toString()
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
              state.localize("cmd.downloadSettings.info.gotLatestVersion"),
              5000
            );
            return;
          }
        }
        customSettings.GitHubGist.lastDownload = cloudSett.lastUpload;
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
          if (file.remoteName === state.environment.FILE_EXTENSION_NAME) {
            if (syncSetting.syncExtensions) {
              if (syncSetting.removeExtensions) {
                try {
                  deletedExtensions = await PluginService.DeleteExtensions(
                    content,
                    ignoredExtensions
                  );
                } catch (err) {
                  vscode.window.showErrorMessage(
                    state.localize("cmd.downloadSettings.error.removeExtFail")
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
              file.remoteName === state.environment.FILE_KEYBINDING_DEFAULT ||
              file.remoteName === state.environment.FILE_KEYBINDING_MAC
            ) {
              let test: string = "";
              state.environment.OsType === OsType.Mac &&
              !customSettings.universalKeybindings
                ? (test = state.environment.FILE_KEYBINDING_MAC)
                : (test = state.environment.FILE_KEYBINDING_DEFAULT);
              if (file.remoteName !== test) {
                writeFile = false;
              }
            }
            if (writeFile) {
              if (file.remoteName === state.environment.FILE_KEYBINDING_MAC) {
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
                file.remoteName === state.environment.FILE_SETTING_NAME ||
                file.remoteName === state.environment.FILE_KEYBINDING_MAC ||
                file.remoteName === state.environment.FILE_KEYBINDING_DEFAULT
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
          LoggerService.ShowSummaryOutput(
            false,
            updatedFiles,
            deletedExtensions,
            addedExtensions,
            null,
            localSettings
          );
          const message = await vscode.window.showInformationMessage(
            state.localize("common.prompt.restartCode"),
            "Yes"
          );

          if (message === "Yes") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
          vscode.window.setStatusBarMessage("").dispose();
        } else {
          vscode.window.setStatusBarMessage("").dispose();
          vscode.window.setStatusBarMessage(
            state.localize("cmd.downloadSettings.info.downloaded"),
            5000
          );
        }
        if (syncSetting.autoUpload) {
          await AutoUploadService.HandleStartWatching();
        }
      } else {
        vscode.window.showErrorMessage(
          state.localize("cmd.downloadSettings.error.unableSave")
        );
      }
    }
  }

  public async Connect(): Promise<void> {
    const customSettings = await state.settings.GetCustomSettings();

    const githubApiConfig: GitHubApi.Options = {};

    const proxyURL: string =
      vscode.workspace.getConfiguration("http").get("proxy") ||
      (process.env as IEnv).http_proxy ||
      (process.env as IEnv).HTTP_PROXY;
    if (customSettings.GitHubGist.githubEnterpriseUrl) {
      githubApiConfig.baseUrl = customSettings.GitHubGist.githubEnterpriseUrl;
    }

    if (proxyURL) {
      githubApiConfig.agent = new HttpsProxyAgent(proxyURL);
    }

    if (customSettings.GitHubGist.token) {
      githubApiConfig.auth = `token ${customSettings.GitHubGist.token}`;
    }
    try {
      this.githubApi = new GitHubApi(githubApiConfig);
    } catch (err) {
      console.error(err);
    }
    if (customSettings.GitHubGist.token) {
      const res = await this.githubApi.users.getAuthenticated();
      console.log(`Sync : Connected with user '${res.data.login}'`);
    }
  }

  public AddFile(list: File[], gistData: any) {
    for (const file of list) {
      if (file.content !== "") {
        gistData.files[file.remoteName] = {};
        gistData.files[file.remoteName].content = file.content;
      }
    }
    return gistData;
  }

  public async CreateEmptyGIST(
    publicGist: boolean,
    gistDescription: string
  ): Promise<string> {
    this.emptyGist.public = !!publicGist;

    if (gistDescription) {
      this.emptyGist.description = gistDescription;
    }

    try {
      const res = await this.githubApi.gists.create(this.emptyGist);
      if (res.data && res.data.id) {
        return res.data.id.toString();
      } else {
        console.error("ID is null");
        console.log(`Sync: Response from GitHub is: ${res}`);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  public async ReadGist(
    GIST: string
  ): Promise<GitHubApi.Response<IFixGistResponse>> {
    const promise = this.githubApi.gists.get({ gist_id: GIST });
    const res = await promise.catch(err => {
      if (String(err).includes("HttpError: Not Found")) {
        return LoggerService.LogException(err, "Sync: Invalid Gist ID", true);
      }
      LoggerService.LogException(err, LoggerService.defaultError, true);
    });
    if (res) {
      return res;
    }
  }

  public async IsGistNewer(
    GIST: string,
    localLastUpload: Date
  ): Promise<boolean> {
    const gist = await this.ReadGist(GIST);
    if (!gist) {
      return;
    }
    const gistLastUpload = new Date(
      JSON.parse(gist.data.files.cloudSettings.content).lastUpload
    );
    if (!localLastUpload) {
      return false;
    }
    return gistLastUpload > localLastUpload;
  }

  public UpdateGIST(gistObject: any, files: File[]): any {
    const allFiles: string[] = Object.keys(gistObject.data.files);
    for (const fileName of allFiles) {
      let exists = false;

      for (const settingFile of files) {
        if (settingFile.remoteName === fileName) {
          exists = true;
        }
      }

      if (!exists && !fileName.startsWith("keybindings")) {
        gistObject.data.files[fileName] = null;
      }
    }

    gistObject.data = this.AddFile(files, gistObject.data);
    return gistObject;
  }

  public async SaveGIST(gistObject: any): Promise<boolean> {
    gistObject.gist_id = gistObject.id;
    const promise = this.githubApi.gists.update(gistObject);

    const res = await promise.catch(err => {
      if (String(err).includes("HttpError: Not Found")) {
        return LoggerService.LogException(err, "Sync: Invalid Gist ID", true);
      }
      LoggerService.LogException(err, LoggerService.defaultError, true);
    });

    if (res) {
      return true;
    }
  }

  public async CustomFilesFromGist(
    customSettings: CustomConfig,
    syncSetting: ExtensionConfig
  ): Promise<File[]> {
    await this.Connect();
    const res = await this.ReadGist(syncSetting.gist);
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

  public async IsConfigured() {
    const [extSettings, customSettings] = await Promise.all([
      state.settings.GetExtensionSettings(),
      state.settings.GetCustomSettings()
    ]);

    const tokenAvailable = !!customSettings.GitHubGist.token;
    const gistAvailable = !!extSettings.gist;

    return customSettings.GitHubGist.downloadPublicGist
      ? gistAvailable
      : tokenAvailable && gistAvailable;
  }
}
