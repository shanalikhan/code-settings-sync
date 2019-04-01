import * as fs from "fs-extra";
import * as vscode from "vscode";

import Commons from "./commons";
import { OsType } from "./enums";
import { Environment } from "./environmentPath";
import localize from "./localize";
import * as lockfile from "./lockfile";
import { File, FileService } from "./service/fileService";
import { GitHubService } from "./service/githubService";
import { GitService } from "./service/gitService";
import { ExtensionInformation, PluginService } from "./service/pluginService";
import {
  CloudSetting,
  CustomSettings,
  ExtensionConfig,
  LocalConfig
} from "./setting";

import PragmaUtil from "./pragmaUtil";

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
    let git: GitService = null;
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

      if (localConfig.customConfig.syncMode === "git") {
        const repoUrl: string = localConfig.extConfig.repoUrl;
        const token: string = localConfig.customConfig.repoServiceTokens.github;
        git = new GitService(env.USER_FOLDER);
        github = new GitHubService(
          token,
          localConfig.customConfig.githubEnterpriseUrl
        );
        await Promise.all([
          github.Authenticate(),
          git.initialize(
            token,
            repoUrl,
            localConfig.customConfig.gitBranch,
            localConfig.customConfig.forcePush,
            localConfig.customConfig.forcePull
          )
        ]);

        const repoInfo: any = await github.GetRepo(git.owner, git.repoName);
        if (repoInfo) {
          if (!repoInfo.data.permissions.push) {
            throw new Error(localize("cmd.updateSettings.error.gitNoPushPermissions"));
          }
        } else if (git.owner !== github.userName) {
          throw new Error(localize("cmd.updateSettings.error.gitNotOwner"));
        } else {
          await github.CreateRepo(git.repoName);
        }
      } else {
        github = new GitHubService(
          localConfig.customConfig.token,
          localConfig.customConfig.githubEnterpriseUrl
        );
        await github.Authenticate();
      }

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

      if (customSettings.syncMode === "gist" && customSettings.downloadPublicGist) {
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
        const done: boolean =
          await FileService.WriteFile(extensionFile.filePath, extensionFile.content);
        if (!done) {
          vscode.window.showWarningMessage(
            localize("cmd.updateSettings.warning.extFileNotSaved")
          );
        }
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
                return contentFile.filePath.indexOf(folder) !== -1;
              }
            );
            return matchedFolders.length === 0;
          });
        }
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
        Commons.LogException(null, common.ERROR_MESSAGE, true);
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

      if (customSettings.syncMode === "git") {
        vscode.window.setStatusBarMessage(
          localize("cmd.updateSettings.info.addingFile"),
          1000
        );
        console.log("Adding Files...");
        await git.Add(allSettingFiles);

        vscode.window.setStatusBarMessage(
          localize("cmd.updateSettings.info.committing"),
          1000
        );
        console.log("Commiting...");
        await git.Commit(dateNow.toString());

        vscode.window.setStatusBarMessage(
          localize("cmd.updateSettings.info.pushing"),
          1000
        );
        console.log("Pushing to repository...");
        await git.Push();

        const status: any = await git.Status();
        console.log(status);

        const settingsUpdated = await common.SaveSettings(syncSetting);
        const customSettingsUpdated = await common.SetCustomSettings(
          customSettings
        );

        if (settingsUpdated && customSettingsUpdated) {
          const commitID: string = await git.GetCommitID();
          vscode.window.showInformationMessage(
            localize(
              "cmd.updateSettings.info.uploadingDone.git",
              commitID
            )
          );
        }
        if(syncSetting.autoUpload) common.StartWatch();
        return;
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
    let git: GitService = null;
    let github: GitHubService = null;
    let localSettings: LocalConfig = new LocalConfig();
    common.CloseWatch();

    try {
      localSettings = await common.InitalizeSettings(true, true);

      if (localSettings.customConfig.syncMode === "git") {
        const repoUrl: string = localSettings.extConfig.repoUrl;
        const token: string = localSettings.customConfig.repoServiceTokens.github;
        git = new GitService(env.USER_FOLDER);
        github = new GitHubService(
          token,
          localSettings.customConfig.githubEnterpriseUrl
        );
        await Promise.all([
          github.Authenticate(),
          git.initialize(
            token,
            repoUrl,
            localSettings.customConfig.gitBranch,
            localSettings.customConfig.forcePush,
            localSettings.customConfig.forcePull
          )
        ]);

        const repoInfo: any = await github.GetRepo(git.owner, git.repoName);
        if (!repoInfo) {
          throw new Error(localize("cmd.downloadSettings.error.noGitRepo"));
        } else if (!repoInfo.data.permissions.pull) {
          throw new Error(localize("cmd.downloadSettings.error.noPullPermission"));
        }
      } else {
        github = new GitHubService(
          localSettings.customConfig.token,
          localSettings.customConfig.githubEnterpriseUrl
        );
        await github.Authenticate();
      }

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

      if (customSettings.syncMode === "git") {
        await git.Pull();
        const extensionFile: File = await FileService.GetFile(env.FILE_EXTENSION, env.FILE_EXTENSION_NAME);
        const ignoredExtensions: string[] = customSettings.ignoreExtensions || new Array<string>();

        if (extensionFile && syncSetting.syncExtensions) {
          await PluginService.UpdateExtensions(
            env, extensionFile.content, ignoredExtensions, syncSetting.removeExtensions, syncSetting.quietSync
          );
        }
        return;
      }

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
              [addedExtensions, deletedExtensions] = await PluginService.UpdateExtensions(
                env, content, ignoredExtensions, syncSetting.removeExtensions, syncSetting.quietSync
              );
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
      "cmd.otherOptions.preserve",
      "cmd.otherOptions.customizedSync",
      "cmd.otherOptions.downloadCustomFile",
      "cmd.otherOptions.joinCommunity",
      "cmd.otherOptions.openIssue",
      "cmd.otherOptions.releaseNotes",
      "cmd.otherOptions.editGitBranch",
      "cmd.otherOptions.toggleForcePush",
      "cmd.otherOptions.toggleForcePull",
      "cmd.otherOptions.toggleSyncMode"
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
                localize("cmd.otherOptions.preserve.info.done2", input, val)
              );
            }
          }
        }
      },
      8: async () => {
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
      9: async () => {
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
      10: async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk"
          )
        );
      },
      11: async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://github.com/shanalikhan/code-settings-sync/issues/new"
          )
        );
      },
      12: async () => {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html"
          )
        );
      },
      13: async () => {
        // change git branch
        const validator: RegExp = /^[a-zA-Z0-9]+[a-zA-Z0-9\-]*$/;
        const options: vscode.InputBoxOptions = {
          "password": false,
          "prompt": localize("cmd.otherOptions.editGitBranch.prompt"),
          "placeHolder": localize("cmd.otherOptions.editGitBranch.placeholder"),
          "value": customSettings.gitBranch,
          "ignoreFocusOut": true,
        };
        const newBranch: string = await vscode.window.showInputBox(options);
        if (!newBranch) {
          vscode.window.showInformationMessage(
            localize("cmd.otherOptions.editGitBranch.noSet")
          );
          return;
        }
        if (!validator.test(newBranch)) {
          vscode.window.showErrorMessage(
            localize("cmd.otherOptions.editGitBranch.invalidBranchName")
          );
          return;
        }
        customSettings.gitBranch = newBranch;
        const done: boolean = await common.SetCustomSettings(customSettings);
        if (done) {
          vscode.window.showInformationMessage(
            localize("cmd.otherOptions.editGitBranch.set", customSettings.gitBranch)
          );
        }
      },
      14: async () => {
        // toggle force push
        customSettings.forcePush = !customSettings.forcePush;
        const done: boolean = await common.SetCustomSettings(customSettings);
        if (done) {
          const message = customSettings.forcePush
            ? "cmd.otherOptions.toggleForcePush.on"
            : "cmd.otherOptions.toggleForcePush.off"
          vscode.window.showInformationMessage(
            localize(message)
          );
        }
      },
      15: async () => {
        // toggle force pull
        customSettings.forcePull = !customSettings.forcePull;
        const done: boolean = await common.SetCustomSettings(customSettings);
        if (done) {
          const message = customSettings.forcePull
            ? "cmd.otherOptions.toggleForcePull.on"
            : "cmd.otherOptions.toggleForcePull.off"
          vscode.window.showInformationMessage(
            localize(message)
          );
        }
      },
      16: async () => {
        // toggle sync mode
        customSettings.syncMode = customSettings.syncMode === "gist" ? "git" : "gist";
        const done: boolean = await common.SetCustomSettings(customSettings);
        if (done) {
          const message = customSettings.syncMode === "git"
            ? "cmd.otherOptions.toggleSyncMode.git"
            : "cmd.otherOptions.toggleSyncMode.gist"
          vscode.window.showInformationMessage(
            localize(message)
          );
        }
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

  private async getCustomFilesFromGist(
    customSettings: CustomSettings,
    syncSetting: ExtensionConfig
  ): Promise<File[]> {
    const github = new GitHubService(
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
