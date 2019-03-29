import * as fs from "fs-extra";
import * as vscode from "vscode";

import Commons from "./commons";
import { OsType } from "./enums";
import { Environment } from "./environmentPath";
import localize from "./localize";
import * as lockfile from "./lockfile";
import { File, FileService } from "./service/fileService";
import { GistService } from "./service/gistService";
import { ExtensionInformation, PluginService } from "./service/pluginService";
import { RepoService } from "./service/repoService";
import {
  CloudSetting,
  CustomSettings,
  ExtensionConfig,
  LocalConfig
} from "./setting";

let repoService: RepoService;
let gistService: GistService;
let env: Environment;

import { writeFileSync } from "fs-extra";
import PragmaUtil from "./pragmaUtil";

export class Sync {
  private globalCommonService: Commons;
  constructor(private context: vscode.ExtensionContext) {}
  /**
   * Run when extension have been activated
   */
  public async bootstrap(): Promise<void> {
    env = new Environment(this.context);
    this.globalCommonService = new Commons(env, this.context);
    // if lock file not exist
    // then create it
    if (!(await FileService.FileExists(env.FILE_SYNC_LOCK))) {
      await fs.close(await fs.open(env.FILE_SYNC_LOCK, "w"));
    }

    // if is locked;
    if (await lockfile.Check(env.FILE_SYNC_LOCK)) {
      await lockfile.Unlock(env.FILE_SYNC_LOCK);
    }

    await this.globalCommonService.StartMigrationProcess();
    const startUpSetting = await this.globalCommonService.GetSettings();
    const startUpCustomSetting = await this.globalCommonService.GetCustomSettings();

    gistService = new GistService({
      token: startUpCustomSetting.gistSettings.token,
      workingDirectory: env.USER_FOLDER
    });

    if (startUpSetting) {
      if (startUpCustomSetting.method === "repo") {
        repoService = new RepoService({
          workingDirectory: env.USER_FOLDER,
          repoURL: startUpCustomSetting.repoSettings.repo,
          ignored: startUpCustomSetting.repoSettings.ignoredItems
        });

        if (startUpSetting.autoDownload === true) {
          vscode.commands.executeCommand("extension.downloadSettings");
        }

        if (startUpSetting.autoUpload) {
          return this.globalCommonService.StartWatch();
        }
      } else {
        const tokenAvailable: boolean =
          startUpCustomSetting.gistSettings.token != null &&
          startUpCustomSetting.gistSettings.token !== "";
        const gistAvailable: boolean =
          startUpSetting.gist != null && startUpSetting.gist !== "";

        if (gistAvailable === true && startUpSetting.autoDownload === true) {
          vscode.commands.executeCommand("extension.downloadSettings");
        }
        if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
          return this.globalCommonService.StartWatch();
        }
      }
    }
  }
  /**
   * Upload setting to github gist
   */

  public async upload(): Promise<void> {
    const args = arguments;
    let localConfig: LocalConfig = new LocalConfig();
    const allSettingFiles: File[] = [];
    let uploadedExtensions: ExtensionInformation[] = [];
    const ignoredExtensions: ExtensionInformation[] = [];
    const dateNow = new Date();
    this.globalCommonService.CloseWatch();

    async function syncExtensions() {
      localConfig = await this.globalCommonService.InitalizeSettings();
      if (localConfig.extConfig.syncExtensions) {
        uploadedExtensions = PluginService.CreateExtensionList();
        if (
          localConfig.customConfig.ignoreExtensions &&
          localConfig.customConfig.ignoreExtensions.length > 0
        ) {
          uploadedExtensions = uploadedExtensions.filter(extension => {
            if (
              localConfig.customConfig.ignoreExtensions.includes(extension.name)
            ) {
              ignoredExtensions.push(extension);
              return false;
            }
            return true;
          });
        }
        uploadedExtensions.sort((a, b) => a.name.localeCompare(b.name));
        const extensionFilePath = env.FILE_EXTENSION;
        const extensionFileContent = JSON.stringify(
          uploadedExtensions,
          undefined,
          2
        );
        const extensionFile = {
          path: extensionFilePath,
          content: extensionFileContent
        };
        return extensionFile;
      } else {
        return false;
      }
    }

    if (repoService) {
      const extensionFile = await syncExtensions();
      if (extensionFile) {
        writeFileSync(extensionFile.path, extensionFile.content);
      }
      vscode.window.setStatusBarMessage(
        localize("cmd.updateSettings.info.uploading"),
        2000
      );
      await repoService.push();
      vscode.window.setStatusBarMessage(
        localize("cmd.updateSettings.info.uploadingSuccess"),
        5000
      );
      this.globalCommonService.StartWatch();
      return;
    }

    try {
      localConfig = await this.globalCommonService.InitalizeSettings();
      localConfig.publicGist = false;
      if (args.length > 0) {
        if (args[0] === "publicGIST") {
          localConfig.publicGist = true;
        }
      }

      gistService = new GistService({
        token: localConfig.customConfig.gistSettings.token,
        workingDirectory:
          localConfig.customConfig.gistSettings.githubEnterpriseUrl
      });
      // ignoreSettings = await common.GetIgnoredSettings(localConfig.customConfig.ignoreUploadSettings);
      await startGitProcess(localConfig.extConfig, localConfig.customConfig);
      // await common.SetIgnoredSettings(ignoreSettings);
    } catch (error) {
      Commons.LogException(error, this.globalCommonService.ERROR_MESSAGE, true);
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

      if (customSettings.gistSettings.downloadPublicGist) {
        if (
          customSettings.gistSettings.token == null ||
          customSettings.gistSettings.token === ""
        ) {
          vscode.window.showInformationMessage(
            localize("cmd.updateSettings.warning.noToken")
          );

          return;
        }
      }

      customSettings.gistSettings.lastUpload = dateNow;
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
        customSettings.gistSettings.supportedFileExtensions
      );

      const customExist: boolean = await FileService.FileExists(
        env.FILE_CUSTOMIZEDSETTINGS
      );
      if (customExist) {
        contentFiles = contentFiles.filter(
          contentFile =>
            contentFile.fileName !== env.FILE_CUSTOMIZEDSETTINGS_NAME
        );

        if (customSettings.gistSettings.ignoreUploadFiles.length > 0) {
          contentFiles = contentFiles.filter(contentFile => {
            const isMatch: boolean =
              customSettings.gistSettings.ignoreUploadFiles.indexOf(
                contentFile.fileName
              ) === -1 &&
              contentFile.fileName !== env.FILE_CUSTOMIZEDSETTINGS_NAME;
            return isMatch;
          });
        }
        if (customSettings.gistSettings.ignoreUploadFolders.length > 0) {
          contentFiles = contentFiles.filter((contentFile: File) => {
            const matchedFolders = customSettings.gistSettings.ignoreUploadFolders.filter(
              folder => {
                return contentFile.filePath.indexOf(folder) === -1;
              }
            );
            return matchedFolders.length > 0;
          });
        }
        const customFileKeys: string[] = Object.keys(
          customSettings.gistSettings.customFiles
        );
        if (customFileKeys.length > 0) {
          for (const key of customFileKeys) {
            const val = customSettings.gistSettings.customFiles[key];
            const customFile: File = await FileService.GetCustomFile(val, key);
            if (customFile !== null) {
              allSettingFiles.push(customFile);
            }
          }
        }
      } else {
        Commons.LogException(
          null,
          this.globalCommonService.ERROR_MESSAGE,
          true
        );
        return;
      }

      for (const snippetFile of contentFiles) {
        if (snippetFile.fileName !== env.FILE_KEYBINDING_MAC) {
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

        if (snippetFile.fileName === env.FILE_SETTING_NAME) {
          try {
            snippetFile.content = PragmaUtil.processBeforeUpload(
              snippetFile.content
            );
          } catch (e) {
            Commons.LogException(null, e.message, true);
            console.error(e);
            return;
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
          if (customSettings.gistSettings.askGistName) {
            customSettings.gistSettings.gistDescription = await this.globalCommonService.AskGistName();
          }
          newGIST = true;
          const gistID = await gistService.CreateEmptyGist({
            public: localConfig.publicGist,
            description: customSettings.gistSettings.gistDescription
          });
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
        let gistObj = await gistService.ReadGist(syncSetting.gist);
        if (!gistObj) {
          vscode.window.showErrorMessage(
            localize("cmd.updateSettings.error.readGistFail", syncSetting.gist)
          );
          return;
        }

        if (gistObj.data.owner !== null) {
          const gistOwnerName: string = gistObj.data.owner.login.trim();
          if (gistService.options.username != null) {
            const userName: string = gistService.options.username.trim();
            if (gistOwnerName !== userName) {
              Commons.LogException(
                null,
                "Sync: You cant edit GIST for user : " +
                  gistObj.data.owner.login,
                true,
                () => {
                  console.log("Sync: Current User : " + "'" + userName + "'");
                  console.log(
                    "Sync: Gist Owner User : " + "'" + gistOwnerName + "'"
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
        gistObj = gistService.UpdateGist(gistObj, allSettingFiles);
        completed = await gistService.SaveGist(gistObj.data);
        if (!completed) {
          vscode.window.showErrorMessage(
            localize("cmd.updateSettings.error.gistNotSave")
          );
          return;
        }
      } catch (err) {
        Commons.LogException(err, this.globalCommonService.ERROR_MESSAGE, true);
        return;
      }

      if (completed) {
        try {
          const settingsUpdated = await this.globalCommonService.SaveSettings(
            syncSetting
          );
          const customSettingsUpdated = await this.globalCommonService.SetCustomSettings(
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
              this.globalCommonService.ShowSummaryOutput(
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
              this.globalCommonService.StartWatch();
            }
          }
        } catch (err) {
          Commons.LogException(
            err,
            this.globalCommonService.ERROR_MESSAGE,
            true
          );
        }
      }
    }
  }
  /**
   * Download setting from github gist
   */
  public async download(): Promise<void> {
    const common = new Commons(env, this.context);
    let localSettings: LocalConfig = new LocalConfig();
    common.CloseWatch();

    if (repoService) {
      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.readdingOnline"),
        2000
      );
      await repoService.pull();
      common.StartWatch();
      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.downloaded"),
        5000
      );
      return;
    }

    try {
      localSettings = await common.InitalizeSettings();
      await StartDownload(localSettings.extConfig, localSettings.customConfig);
    } catch (err) {
      Commons.LogException(err, common.ERROR_MESSAGE, true);
      return;
    }

    async function StartDownload(
      syncSetting: ExtensionConfig,
      customSettings: CustomSettings
    ) {
      vscode.window.setStatusBarMessage("").dispose();
      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.readdingOnline"),
        2000
      );

      const res = await gistService.ReadGist(syncSetting.gist);

      if (!res) {
        Commons.LogException(res, "Sync: Unable to Read Gist.", true);
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

        const lastUploadStr: string = customSettings.gistSettings.lastUpload
          ? customSettings.gistSettings.lastUpload.toString()
          : "";
        const lastDownloadStr: string = customSettings.gistSettings.lastDownload
          ? customSettings.gistSettings.lastDownload.toString()
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
        customSettings.gistSettings.lastDownload = cloudSett.lastUpload;
      }

      keys.forEach(gistName => {
        if (res.data.files[gistName]) {
          if (res.data.files[gistName].content) {
            const prefix = FileService.CUSTOMIZED_SYNC_PREFIX;
            if (gistName.indexOf(prefix) > -1) {
              const fileName = gistName.split(prefix).join(""); // |customized_sync|.htmlhintrc => .htmlhintrc
              if (!(fileName in customSettings.gistSettings.customFiles)) {
                // syncLocalSettings.json > customFiles doesn't have key
                return;
              }
              const f: File = new File(
                fileName,
                res.data.files[gistName].content,
                customSettings.gistSettings.customFiles[fileName],
                gistName
              );
              updatedFiles.push(f);
            } else if (gistName.indexOf(".") > -1) {
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
        let content: string = file.content;

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

              try {
                let useCli = true;
                const autoUpdate: boolean = vscode.workspace
                  .getConfiguration("extensions")
                  .get("autoUpdate");
                useCli = autoUpdate && !env.isCoderCom;
                if (useCli) {
                  if (!syncSetting.quietSync) {
                    Commons.outputChannel = vscode.window.createOutputChannel(
                      "Code Settings Sync"
                    );
                    Commons.outputChannel.clear();
                    Commons.outputChannel.appendLine(
                      `COMMAND LINE EXTENSION DOWNLOAD SUMMARY`
                    );
                    Commons.outputChannel.appendLine(`--------------------`);
                    Commons.outputChannel.show();
                  }
                }

                addedExtensions = await PluginService.InstallExtensions(
                  content,
                  env.ExtensionFolder,
                  useCli,
                  ignoredExtensions,
                  env.OsType,
                  env.isInsiders,
                  (message: string, dispose: boolean) => {
                    if (!syncSetting.quietSync) {
                      Commons.outputChannel.appendLine(message);
                    } else {
                      console.log(message);
                      if (dispose) {
                        vscode.window.setStatusBarMessage(
                          "Sync: " + message,
                          3000
                        );
                      }
                    }
                  }
                );
              } catch (extensions) {
                addedExtensions = extensions;
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
              let filePath: string = "";
              if (file.filePath !== null) {
                filePath = await FileService.CreateCustomDirTree(file.filePath);
              } else {
                filePath = await FileService.CreateDirTree(
                  env.USER_FOLDER,
                  file.fileName
                );
              }

              if (file.gistName === env.FILE_SETTING_NAME) {
                const localContent = await FileService.ReadFile(filePath);
                content = PragmaUtil.processBeforeWrite(
                  localContent,
                  content,
                  env.OsType,
                  localSettings.customConfig.hostName
                );
              }

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
        "Sync: Unable to clear settings. Error Logged on console. Please open an issue.",
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
      customSettings.gistSettings.token != null &&
      customSettings.gistSettings.token !== "";
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
          customSettings.gistSettings.downloadPublicGist = false;
          await common.SetCustomSettings(customSettings);
        }
      },
      2: async () => {
        // Download Settings from Public GIST
        selectedItem = 2;
        customSettings.gistSettings.downloadPublicGist = true;
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
          customSettings.gistSettings.customFiles[fileName] = input;
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
              "Sync: Unable to toggle. Please open an issue.",
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
    const res = await gistService.ReadGist(syncSetting.gist);
    if (!res) {
      Commons.LogException(res, "Sync: Unable to Read Gist.", true);
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
              fileName in customSettings.gistSettings.customFiles
                ? customSettings.gistSettings.customFiles[fileName]
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
