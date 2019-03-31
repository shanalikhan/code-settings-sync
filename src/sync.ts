import * as fs from "fs-extra";
import * as vscode from "vscode";

import * as anymatch from "anymatch";
import Commons from "./commons";
import { OsType } from "./enums";
import { Environment } from "./environmentPath";
import localize from "./localize";
import * as lockfile from "./lockfile";
import { File, FileService, FileServiceAsync } from "./service/fileService";
import { GistService } from "./service/gistService";
import { ExtensionInformation, PluginService } from "./service/pluginService";
import { RepoService } from "./service/repoService";
import { CloudSetting, CustomSettings, LocalConfig } from "./setting";

let repoService: RepoService;
let gistService: GistService;
let env: Environment;
let globalCommonService: Commons;

import { resolve } from "path";
import PragmaUtil from "./pragmaUtil";

export class Sync {
  constructor(private context: vscode.ExtensionContext) {}
  /**
   * Run when extension have been activated
   */
  public async bootstrap(): Promise<void> {
    env = new Environment(this.context);
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
    const startUpCustomSetting = await globalCommonService.GetCustomSettings();

    if (startUpCustomSetting) {
      if (startUpCustomSetting.syncMethod === "repo") {
        const rs = startUpCustomSetting.repoSettings;
        const configured =
          rs.repo !== "" && rs.token !== "" && rs.username !== "";
        if (configured) {
          repoService = new RepoService({
            workingDirectory: env.USER_FOLDER,
            repoURL: `https://${rs.username}:${rs.token}@${rs.repo}`,
            ignored: startUpCustomSetting.ignoredItems
          });

          if (startUpCustomSetting.autoDownload === true) {
            vscode.commands.executeCommand("extension.downloadSettings");
          }

          if (startUpCustomSetting.autoUpload) {
            return globalCommonService.autoUploadService.StartWatching();
          }
        } else {
          return globalCommonService.OpenSettingsPage();
        }
      }
      if (startUpCustomSetting.syncMethod === "gist") {
        const gs = startUpCustomSetting.gistSettings;
        const configured = gs.token !== "";
        if (configured) {
          gistService = new GistService({
            token: gs.token,
            workingDirectory: env.USER_FOLDER,
            enterpriseURL: gs.githubEnterpriseUrl
          });

          if (startUpCustomSetting.autoDownload === true) {
            vscode.commands.executeCommand("extension.downloadSettings");
          }
          if (startUpCustomSetting.autoUpload) {
            return globalCommonService.autoUploadService.StartWatching();
          }
        } else {
          return globalCommonService.OpenSettingsPage();
        }
      }
    }
  }
  /**
   * Upload setting to github gist
   */

  public async upload(): Promise<void> {
    const localConfig: LocalConfig = await globalCommonService.InitalizeSettings();
    const allSettingFiles: File[] = [];
    let uploadedExtensions: ExtensionInformation[] = [];
    const ignoredExtensions: ExtensionInformation[] = [];
    const dateNow = new Date();

    if (localConfig.customConfig.syncMethod === "repo") {
      const configured =
        localConfig.customConfig.repoSettings.repo !== "" &&
        localConfig.customConfig.repoSettings.token !== "" &&
        localConfig.customConfig.repoSettings.username !== "";
      if (configured) {
        globalCommonService.autoUploadService.StopWatching();
        if (localConfig.customConfig.syncExtensions) {
          const file = getExtensions(localConfig.customConfig);
          fs.writeFileSync(file.path, file.content);
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
      } else {
        return globalCommonService.OpenSettingsPage();
      }
      return globalCommonService.autoUploadService.StartWatching();
    } else {
      const configured =
        localConfig.customConfig.gistSettings.gist !== "" &&
        localConfig.customConfig.gistSettings.token !== "";
      if (configured) {
        globalCommonService.autoUploadService.StopWatching();
        try {
          await startUploadingToGist(localConfig.customConfig);
        } catch (err) {
          Commons.LogException(err, globalCommonService.ERROR_MESSAGE, true);
        }
        return;
      }
    }

    function getExtensions(customSettings: CustomSettings) {
      uploadedExtensions = PluginService.CreateExtensionList();
      if (
        customSettings.ignoredExtensions &&
        customSettings.ignoredExtensions.length > 0
      ) {
        uploadedExtensions = uploadedExtensions.filter(extension => {
          if (customSettings.ignoredExtensions.includes(extension.info.name)) {
            ignoredExtensions.push(extension);
            return false;
          }
          return true;
        });
      }
      uploadedExtensions.sort((a, b) => a.info.name.localeCompare(b.info.name));
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
      return extensionFile;
    }

    async function startUploadingToGist(customSettings: CustomSettings) {
      vscode.window.setStatusBarMessage(
        localize("cmd.updateSettings.info.uploading"),
        2000
      );

      customSettings.gistSettings.lastUpload = dateNow;
      vscode.window.setStatusBarMessage(
        localize("cmd.updateSettings.info.readding"),
        2000
      );

      // var remoteList = ExtensionInformation.fromJSONList(file.content);
      // var deletedList = PluginService.GetDeletedExtensions(uploadedExt\ensions);

      let contentFiles = await FileServiceAsync.ListFiles(
        env.USER_FOLDER,
        0,
        2,
        customSettings.gistSettings.supportedFileExtensions
      );

      const matcher = customSettings.ignoredItems.map(item => {
        if (FileService.IsDirectory(resolve(env.USER_FOLDER, item))) {
          return `**/${item}/**`;
        } else {
          return `**/${item}`;
        }
      });

      contentFiles = contentFiles.filter(cf => !anymatch(matcher, cf.path));

      if (customSettings.gistSettings.customFiles.length > 0) {
        customSettings.gistSettings.customFiles.forEach(cf => {
          const customFile = FileService.GetCustomFile(cf.path);
          if (customFile) {
            allSettingFiles.push(customFile);
          }
        });
      }

      contentFiles.forEach(snippetFile => {
        if (snippetFile.filename !== env.FILE_KEYBINDING_MAC) {
          if (snippetFile.content !== "") {
            if (snippetFile.filename === env.FILE_KEYBINDING_NAME) {
              snippetFile.gistName =
                env.OsType === OsType.Mac
                  ? env.FILE_KEYBINDING_MAC
                  : env.FILE_KEYBINDING_DEFAULT;
            }
            if (snippetFile.filename === env.FILE_SETTING_NAME) {
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
            allSettingFiles.push(snippetFile);
          }
        }
      });

      if (customSettings.syncExtensions) {
        allSettingFiles.push(getExtensions(customSettings));
      }

      const extProp = new CloudSetting();
      extProp.lastUpload = dateNow;
      const fileName = env.FILE_CLOUDSETTINGS_NAME;
      const fileContent = JSON.stringify(extProp);
      const file = new File(fileName, fileContent, "", fileName);
      allSettingFiles.push(file);

      let completed = false;
      let newGIST = false;
      try {
        if (customSettings.gistSettings.gist === "") {
          if (customSettings.gistSettings.askGistName) {
            customSettings.gistSettings.gistDescription = await globalCommonService.AskGistName();
          }
          newGIST = true;
          const gistID = await gistService.CreateEmptyGist({
            public: localConfig.publicGist,
            description: customSettings.gistSettings.gistDescription
          });
          if (gistID) {
            customSettings.gistSettings.gist = gistID;
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
        let gistObj = await gistService.ReadGist(
          customSettings.gistSettings.gist
        );
        if (!gistObj) {
          vscode.window.showErrorMessage(
            localize(
              "cmd.updateSettings.error.readGistFail",
              customSettings.gistSettings.gist
            )
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
        Commons.LogException(err, globalCommonService.ERROR_MESSAGE, true);
        return;
      }

      if (completed) {
        try {
          const customSettingsUpdated = await globalCommonService.SetCustomSettings(
            customSettings
          );
          if (customSettingsUpdated) {
            if (newGIST) {
              vscode.window.showInformationMessage(
                localize(
                  "cmd.updateSettings.info.uploadingDone",
                  customSettings.gistSettings.gist
                )
              );
            }

            if (localConfig.publicGist) {
              vscode.window.showInformationMessage(
                localize("cmd.updateSettings.info.shareGist")
              );
            }

            if (!customSettings.quietSync) {
              globalCommonService.ShowSummaryOutput(
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
            if (customSettings.autoUpload) {
              globalCommonService.autoUploadService.StartWatching();
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
    const localSettings: LocalConfig = await globalCommonService.InitalizeSettings();

    if (localSettings.customConfig.syncMethod === "repo") {
      globalCommonService.autoUploadService.StopWatching();
      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.readdingOnline"),
        2000
      );
      await repoService.pull();
      await installExtensions(
        localSettings.customConfig,
        [],
        localSettings.customConfig.ignoredExtensions,
        [],
        FileService.ReadFile(resolve(env.USER_FOLDER, "extensions.json"))
      );
      if (localSettings.customConfig.autoUpload) {
        globalCommonService.autoUploadService.StartWatching();
      }

      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.downloaded"),
        5000
      );
      return;
    } else {
      globalCommonService.autoUploadService.StopWatching();
      try {
        await StartDownload(localSettings.customConfig);
        if (localSettings.customConfig.autoUpload) {
          globalCommonService.autoUploadService.StartWatching();
        }
      } catch (err) {
        Commons.LogException(err, globalCommonService.ERROR_MESSAGE, true);
      }
      return;
    }

    async function installExtensions(
      customSettings: CustomSettings,
      deletedExtensions: ExtensionInformation[],
      ignoredExtensions: string[],
      addedExtensions: ExtensionInformation[],
      content: any
    ) {
      if (customSettings.syncExtensions) {
        if (customSettings.removeExtensions) {
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
            if (!customSettings.quietSync) {
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
              if (!customSettings.quietSync) {
                Commons.outputChannel.appendLine(message);
              } else {
                console.log(message);
                if (dispose) {
                  vscode.window.setStatusBarMessage("Sync: " + message, 3000);
                }
              }
            }
          );
          return deletedExtensions.length + addedExtensions.length;
        } catch (extensions) {
          addedExtensions = extensions;
        }
      }
    }

    async function StartDownload(customSettings: CustomSettings) {
      vscode.window.setStatusBarMessage("").dispose();
      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.readdingOnline"),
        2000
      );

      const res = await gistService.ReadGist(customSettings.gistSettings.gist);

      if (!res) {
        Commons.LogException(res, "Sync: Unable to Read Gist.", true);
        return;
      }

      const addedExtensions: ExtensionInformation[] = [];
      const deletedExtensions: ExtensionInformation[] = [];
      const ignoredExtensions: string[] =
        customSettings.ignoredExtensions || new Array<string>();
      const updatedFiles: File[] = [];
      const actionList: Array<void | boolean> = [];

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

        if (!customSettings.forceDownload) {
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
              if (customSettings.gistSettings.customFiles.length === 0) {
                // syncLocalSettings.json > customFiles doesn't have any files
                return;
              }
              const f: File = new File(
                fileName,
                res.data.files[gistName].content,
                customSettings.gistSettings.customFiles.filter(
                  cf => cf.filename === fileName
                )[0].path,
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
            installExtensions(
              customSettings,
              deletedExtensions,
              ignoredExtensions,
              addedExtensions,
              content
            );
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
                file.filename = env.FILE_KEYBINDING_DEFAULT;
              }
              let filePath: string = "";
              if (file.path !== null) {
                filePath = await FileService.CreateCustomDirTree(file.path);
              } else {
                filePath = await FileService.CreateDirTree(
                  env.USER_FOLDER,
                  file.filename
                );
              }

              if (file.gistName === env.FILE_SETTING_NAME) {
                const localContent = await FileService.ReadFile(filePath);
                content = PragmaUtil.processBeforeWrite(
                  localContent,
                  content,
                  env.OsType,
                  localSettings.customConfig.hostname
                );
              }

              actionList.push(await FileService.WriteFile(filePath, content));
            }
          }
        }
      }

      await Promise.all(actionList);
      const customSettingsUpdated = await globalCommonService.SetCustomSettings(
        customSettings
      );
      if (customSettingsUpdated) {
        if (!customSettings.quietSync) {
          globalCommonService.ShowSummaryOutput(
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
    let localSettings: CustomSettings = null;

    vscode.window.setStatusBarMessage(
      localize("cmd.resetSettings.info.resetting"),
      2000
    );

    try {
      const common: Commons = new Commons(env, this.context);

      localSettings = new CustomSettings();

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

      if (customSaved) {
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
  public async otherOptions() {
    const customSettings: CustomSettings = await globalCommonService.GetCustomSettings();
    if (!customSettings) {
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

    const items: string[] = [
      "cmd.otherOptions.openSettings",
      "cmd.otherOptions.editLocalSetting",
      "cmd.otherOptions.shareSetting",
      "cmd.otherOptions.customizedSync",
      "cmd.otherOptions.downloadCustomFile",
      "cmd.otherOptions.joinCommunity",
      "cmd.otherOptions.openIssue",
      "cmd.otherOptions.releaseNotes"
    ].map(localize);

    let selectedItem = 0;
    let settingChanged = false;

    const item = await vscode.window.showQuickPick(items);

    // if not pick anyone, do nothing
    if (!item) {
      return;
    }

    const index = items.findIndex(v => v === item);

    const handlers = [
      async () => {
        // Open Settings Page
        globalCommonService.OpenSettingsPage();
      },
      async () => {
        // Edit syncLocalSettings.json
        const file: vscode.Uri = vscode.Uri.file(env.FILE_CUSTOMIZEDSETTINGS);
        fs.openSync(file.fsPath, "r");
        const document = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(
          document,
          vscode.ViewColumn.One,
          true
        );
      },
      async () => {
        // Share public gist
        const answer = await vscode.window.showInformationMessage(
          localize("cmd.otherOptions.shareSetting.beforeConfirm"),
          "Yes"
        );

        if (answer === "Yes") {
          localSetting.publicGist = true;
          settingChanged = true;
          customSettings.gistSettings.gist = "";
          selectedItem = 1;
          customSettings.gistSettings.downloadPublicGist = false;
          await globalCommonService.SetCustomSettings(customSettings);
        }
      },
      async () => {
        // Add customized sync file
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
          customSettings.gistSettings.customFiles.push({
            filename: fileName,
            path: input
          });
          const done: boolean = await globalCommonService.SetCustomSettings(
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
        const customFiles = await this.getCustomFilesFromGist(customSettings);
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
            return file.filename;
          }),
          options
        );
        // if not pick anyone, do nothing
        if (!fileName) {
          return;
        }
        const selected = customFiles.find(f => {
          return f.filename === fileName;
        });
        if (selected && vscode.workspace.rootPath) {
          const downloadPath = FileService.ConcatPath(
            vscode.workspace.rootPath,
            selected.filename
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
        // Join community
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk"
          )
        );
      },
      async () => {
        // Open an issue
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://github.com/shanalikhan/code-settings-sync/issues/new"
          )
        );
      },
      async () => {
        // View release notes
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(
            "https://github.com/shanalikhan/code-settings-sync/blob/master/CHANGELOG.md" // Probably the most up to date copy of release notes
          )
        );
      }
    ];

    try {
      await handlers[index]();
      if (settingChanged) {
        const added = globalCommonService.SetCustomSettings(customSettings);
        if (added) {
          const callbackMap = [
            async () => {
              return await vscode.commands.executeCommand(
                "extension.updateSettings",
                "publicGIST"
              );
            },
            async () => {
              return await vscode.window.showInformationMessage(
                localize("cmd.otherOptions.warning.tokenNotRequire")
              );
            }
          ];

          if (callbackMap[selectedItem]) {
            return callbackMap[selectedItem]();
          }
        } else {
          return vscode.window.showErrorMessage(
            localize("cmd.otherOptions.error.toggleFail")
          );
        }
      }
    } catch (err) {
      Commons.LogException(err, "Error", true);
      return;
    }
  }

  private async getCustomFilesFromGist(
    customSettings: CustomSettings
  ): Promise<File[]> {
    const res = await gistService.ReadGist(customSettings.gistSettings.gist);
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
