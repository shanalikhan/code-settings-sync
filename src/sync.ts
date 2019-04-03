import * as fs from "fs-extra";
import * as vscode from "vscode";

import Commons from "./commons";
import { OsType } from "./enums";
import { Environment } from "./environmentPath";
import localize from "./localize";
import * as lockfile from "./lockfile";
import { File, FileService } from "./service/fileService";
import { GitHubService } from "./service/githubService";
import { GitService, UrlInfo } from "./service/gitService";
import { ExtensionInformation, PluginService } from "./service/pluginService";
import {
  CustomSettings,
  ExtensionConfig,
  LocalConfig
} from "./setting";

import PragmaUtil from "./pragmaUtil";
import { GitHubGistService } from "./service/githubGistService";

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
        startUpCustomSetting.gistSettings.token != null && startUpCustomSetting.gistSettings.token !== "";
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
    let githubGist: GitHubGistService = null;
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

      if (localConfig.customConfig.syncMode.type === "git") {
        const repoUrl: string = localConfig.extConfig.repoUrl;
        const repoService: string = await GitService.ParseUrl(repoUrl, UrlInfo.SERVICE);

        git = new GitService(env.USER_FOLDER);
        await git.initialize(
          localConfig.extConfig.repoUrl,
          localConfig.customConfig.gitSettings[repoService].token,
          localConfig.customConfig.gitSettings[repoService].gitBranch,
          localConfig.customConfig.gitSettings[repoService].forcePush,
          localConfig.customConfig.gitSettings[repoService].forcePull
        );

        if (repoService === "github") {
          github = new GitHubService(
            localConfig.customConfig.gitSettings[repoService].token,
            localConfig.customConfig.githubEnterpriseUrl
          );
          await github.Authenticate();

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
          // Creating Repository on Gitlab is not configured yet. However, pushing and pulling should work
          // throw new Error("Gitlab not configured yet");
        }
      } else {
        githubGist = new GitHubGistService(
          localConfig.customConfig.gistSettings.token,
          localConfig.customConfig.githubEnterpriseUrl
        );
        await githubGist.Authenticate();
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

      if (customSettings.syncMode.type === "gist" && customSettings.gistSettings.downloadPublicGist) {
        if (customSettings.gistSettings.token == null || customSettings.gistSettings.token === "") {
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

      let uploadID: string = null;
      if (customSettings.syncMode.type === "git") {
        uploadID = await git.Upload(
          allSettingFiles,
          dateNow,
          env,
          common,
          localConfig,
          syncSetting,
          customSettings
        );
      } else {
        uploadID = await githubGist.Upload(
          allSettingFiles,
          dateNow,
          env,
          common,
          localConfig,
          syncSetting,
          customSettings
        );
      }

      if (uploadID) {
        try {
          const customSettingsUpdated = await common.SetCustomSettings(
            customSettings
          );
          if (customSettingsUpdated) {
            const message: string = customSettings.syncMode.type === "gist"
              ? "cmd.updateSettings.info.uploadingDone.gist"
              : "cmd.updateSettings.info.uploadingDone.git";
            vscode.window.showInformationMessage(
              localize(message, uploadID)
            );

            if (customSettings.syncMode.type === "gist" && localConfig.publicGist) {
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
    let githubGistService: GitHubGistService = null;
    let localConfig: LocalConfig = new LocalConfig();
    common.CloseWatch();

    try {
       localConfig = await common.InitalizeSettings(true, true);

      if (localConfig.customConfig.syncMode.type === "git") {
        const repoUrl: string = localConfig.extConfig.repoUrl;
        const repoService: string = await GitService.ParseUrl(repoUrl, UrlInfo.SERVICE);

        git = new GitService(env.USER_FOLDER);
        await git.initialize(
          localConfig.extConfig.repoUrl,
          localConfig.customConfig.gitSettings[repoService].token,
          localConfig.customConfig.gitSettings[repoService].gitBranch,
          localConfig.customConfig.gitSettings[repoService].forcePush,
          localConfig.customConfig.gitSettings[repoService].forcePull
        );

        if (repoService === "github") {
          github = new GitHubService(
            localConfig.customConfig.gitSettings[repoService].token,
            localConfig.customConfig.githubEnterpriseUrl
          );
          await github.Authenticate();

          const repoInfo: any = await github.GetRepo(git.owner, git.repoName);
          if (!repoInfo) {
            throw new Error(localize("cmd.downloadSettings.error.noGitRepo"));
          } else if (!repoInfo.data.permissions.pull) {
            throw new Error(localize("cmd.downloadSettings.error.noPullPermission"));
          }
        } else {
          // Repository checking on Gitlab is not configured yet. However, pushing and pulling should work
          // throw new Error("Gitlab not configured yet");
        }

      } else {
        githubGistService = new GitHubGistService(
          localConfig.customConfig.gistSettings.token,
          localConfig.customConfig.githubEnterpriseUrl
        );
        await githubGistService.Authenticate();
      }

      await StartDownload(localConfig.extConfig, localConfig.customConfig);
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

      let returnedMessage: any = null;
      if (customSettings.syncMode.type === "git") {
        returnedMessage = await git.Download(
          env,
          syncSetting,
          customSettings,
          localConfig,
          common
        );
      } else {
        returnedMessage = await githubGistService.Download(
          env,
          syncSetting,
          customSettings,
          localConfig,
          common
        );
      }
      if (!returnedMessage) return;

      let updatedFiles: File[] = [];
      let addedExtensions: ExtensionInformation[] = [];
      let deletedExtensions: ExtensionInformation[] = [];

      [updatedFiles, addedExtensions, deletedExtensions] = returnedMessage;

      const customSettingsUpdated = await common.SetCustomSettings(
        customSettings
      );
      if (customSettingsUpdated) {
        if (!syncSetting.quietSync) {
          common.ShowSummaryOutput(
            false,
            updatedFiles,
            deletedExtensions,
            addedExtensions,
            null,
            localConfig
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
      customSettings.gistSettings.token != null && customSettings.gistSettings.token !== "";
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
        const repoService: string =
          await GitService.ParseUrl(setting.repoUrl, UrlInfo.SERVICE) ||
          await vscode.window.showQuickPick(Object.keys(customSettings.gitSettings));
        if (!repoService) {
          return;
        }

        const validator: RegExp = /^[a-zA-Z0-9]+[a-zA-Z0-9\-]*$/;
        const options: vscode.InputBoxOptions = {
          "password": false,
          "prompt": localize("cmd.otherOptions.editGitBranch.prompt"),
          "placeHolder": localize("cmd.otherOptions.editGitBranch.placeholder"),
          "value": customSettings.gitSettings[repoService].gitBranch,
          "ignoreFocusOut": true,
        };
        const newBranch: string = ((await vscode.window.showInputBox(options)) || "").trim();
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
        customSettings.gitSettings[repoService].gitBranch = newBranch;
        const done: boolean = await common.SetCustomSettings(customSettings);
        if (done) {
          vscode.window.showInformationMessage(
            localize("cmd.otherOptions.editGitBranch.set",
            repoService[0].toUpperCase() + repoService.slice(1),
            customSettings.gitSettings[repoService].gitBranch)
          );
        }
      },
      14: async () => {
        // toggle force push
        const repoService: string =
          await GitService.ParseUrl(setting.repoUrl, UrlInfo.SERVICE) ||
          await vscode.window.showQuickPick(Object.keys(customSettings.gitSettings));
        if (!repoService) {
          return;
        }
        customSettings.gitSettings[repoService].forcePush = !customSettings.gitSettings[repoService].forcePush;
        const done: boolean = await common.SetCustomSettings(customSettings);
        if (done) {
          const message = customSettings.gitSettings[repoService].forcePush
            ? "cmd.otherOptions.toggleForcePush.on"
            : "cmd.otherOptions.toggleForcePush.off"
          vscode.window.showInformationMessage(
            localize(message, repoService[0].toUpperCase() + repoService.slice(1))
          );
        }
      },
      15: async () => {
        // toggle force pull
        const repoService: string =
          await GitService.ParseUrl(setting.repoUrl, UrlInfo.SERVICE) ||
          await vscode.window.showQuickPick(Object.keys(customSettings.gitSettings));

        customSettings.gitSettings[repoService].forcePull = !customSettings.gitSettings[repoService].forcePull;
        const done: boolean = await common.SetCustomSettings(customSettings);
        if (done) {
          const message = customSettings.gitSettings[repoService].forcePull
            ? "cmd.otherOptions.toggleForcePull.on"
            : "cmd.otherOptions.toggleForcePull.off"
          vscode.window.showInformationMessage(
            localize(message, repoService[0].toUpperCase() + repoService.slice(1))
          );
        }
      },
      16: async () => {
        // toggle sync mode
        customSettings.syncMode.type = customSettings.syncMode.type === "gist" ? "git" : "gist";
        const done: boolean = await common.SetCustomSettings(customSettings);
        if (done) {
          const message = customSettings.syncMode.type === "git"
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
      customSettings.gistSettings.token,
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
