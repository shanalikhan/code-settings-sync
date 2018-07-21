"use strict";

import * as fs from "fs-extra";
import * as lockfile from "proper-lockfile";
import * as vscode from "vscode";
import Commons from "./commons";
import { OsType } from "./enums";
import { Environment } from "./environmentPath";
import localize from "./localize";
import { File, FileService } from "./service/fileService";
import { GitHubService } from "./service/githubService";
import { ExtensionInformation, PluginService } from "./service/pluginService";
import {
  CloudSetting,
  CustomSettings,
  ExtensionConfig,
  LocalConfig
} from "./setting";

export async function activate(context: vscode.ExtensionContext) {
  const globalEnv: Environment = new Environment(context);
  const globalCommonService: Commons = new Commons(globalEnv, context);

  // if lock not exist
  if (!(await FileService.FileExists(globalEnv.FILE_SYNC_LOCK))) {
    fs.closeSync(fs.openSync(globalEnv.FILE_SYNC_LOCK, "w"));
  }

  // if is locked;
  if (lockfile.checkSync(globalEnv.FILE_SYNC_LOCK)) {
    lockfile.unlockSync(globalEnv.FILE_SYNC_LOCK);
  }

  await globalCommonService.StartMigrationProcess();
  const startUpSetting: ExtensionConfig = await globalCommonService.GetSettings();
  const startUpCustomSetting: CustomSettings = await globalCommonService.GetCustomSettings();

  if (startUpSetting) {
    const tokenAvailable: boolean =
      startUpCustomSetting.token != null && startUpCustomSetting.token !== "";
    const gistAvailable: boolean =
      startUpSetting.gist != null && startUpSetting.gist !== "";

    if (gistAvailable === true && startUpSetting.autoDownload === true) {
      vscode.commands.executeCommand("extension.downloadSettings").then(suc => {
        if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
          globalCommonService.StartWatch();
        }
      });
    }
    if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
      globalCommonService.StartWatch();
    }
  }

  const updateSettings = vscode.commands.registerCommand(
    "extension.updateSettings",
    async () => {
      const args = arguments;
      const en: Environment = new Environment(context);
      const common: Commons = new Commons(en, context);
      let myGi: GitHubService = null;
      let localConfig: LocalConfig = new LocalConfig();
      const allSettingFiles: File[] = [];
      let uploadedExtensions: ExtensionInformation[] = [];
      const ignoredExtensions: ExtensionInformation[] = [];
      const dateNow: Date = new Date();
      common.CloseWatch();
      const ignoreSettings = new Object();

      try {
        localConfig = await common.InitalizeSettings(true, false);
        localConfig.publicGist = false;
        if (args.length > 0) {
          if (args[0] === "publicGIST") {
            localConfig.publicGist = true;
          }
        }

        myGi = new GitHubService(localConfig.customConfig.token);
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

        syncSetting.lastUpload = dateNow;
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
          const extensionFileName = en.FILE_EXTENSION_NAME;
          const extensionFilePath = en.FILE_EXTENSION;
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
          en.USER_FOLDER,
          0,
          2,
          customSettings.supportedFileExtensions
        );

        const customExist: boolean = await FileService.FileExists(
          en.FILE_CUSTOMIZEDSETTINGS
        );
        if (customExist) {
          customSettings = await common.GetCustomSettings();
          contentFiles = contentFiles.filter(
            contentFile =>
              contentFile.fileName !== en.FILE_CUSTOMIZEDSETTINGS_NAME
          );

          if (customSettings.ignoreUploadFiles.length > 0) {
            contentFiles = contentFiles.filter(contentFile => {
              const isMatch: boolean =
                customSettings.ignoreUploadFiles.indexOf(
                  contentFile.fileName
                ) === -1 &&
                contentFile.fileName !== en.FILE_CUSTOMIZEDSETTINGS_NAME;
              return isMatch;
            });
          }
          if (customSettings.ignoreUploadFolders.length > 0) {
            contentFiles = contentFiles.filter(
              (contentFile: File, index: number) => {
                const matchedFolders = customSettings.ignoreUploadFolders.filter(
                  folder => {
                    return contentFile.filePath.indexOf(folder) === -1;
                  }
                );
                return matchedFolders.length > 0;
              }
            );
          }
        } else {
          Commons.LogException(null, common.ERROR_MESSAGE, true);
          return;
        }

        contentFiles.forEach(snippetFile => {
          if (
            snippetFile.fileName !== en.APP_SUMMARY_NAME &&
            snippetFile.fileName !== en.FILE_KEYBINDING_MAC
          ) {
            if (snippetFile.content !== "") {
              if (snippetFile.fileName === en.FILE_KEYBINDING_NAME) {
                snippetFile.gistName =
                  en.OsType === OsType.Mac
                    ? en.FILE_KEYBINDING_MAC
                    : en.FILE_KEYBINDING_DEFAULT;
              }
              allSettingFiles.push(snippetFile);
            }
          }
        });

        const extProp: CloudSetting = new CloudSetting();
        extProp.lastUpload = dateNow;
        const fileName: string = en.FILE_CLOUDSETTINGS_NAME;
        const fileContent: string = JSON.stringify(extProp);
        const file: File = new File(fileName, fileContent, "", fileName);
        allSettingFiles.push(file);

        let completed: boolean = false;
        let newGIST: boolean = false;

        if (syncSetting.gist == null || syncSetting.gist === "") {
          if (syncSetting.askGistName) {
            customSettings.gistDescription = await common.AskGistName();
          }
          newGIST = true;
          await myGi
            .CreateEmptyGIST(
              localConfig.publicGist,
              customSettings.gistDescription
            )
            .then(
              (gistID: string) => {
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
              },
              (error: any) => {
                Commons.LogException(error, common.ERROR_MESSAGE, true);
                return;
              }
            );
        }

        await myGi.ReadGist(syncSetting.gist).then(
          async (gistObj: any) => {
            if (gistObj) {
              if (gistObj.data.owner !== null) {
                const gistOwnerName: string = gistObj.data.owner.login.trim();
                if (myGi.userName != null) {
                  const userName: string = myGi.userName.trim();
                  if (gistOwnerName !== userName) {
                    Commons.LogException(
                      null,
                      "Sync : You cant edit GIST for user : " +
                        gistObj.data.owner.login,
                      true,
                      () => {
                        console.log(
                          "Sync : Current User : " + "'" + userName + "'"
                        );
                        console.log(
                          "Sync : Gist Owner User : " +
                            "'" +
                            gistOwnerName +
                            "'"
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
              gistObj = myGi.UpdateGIST(gistObj, allSettingFiles);

              await myGi.SaveGIST(gistObj.data).then(
                (saved: boolean) => {
                  if (saved) {
                    completed = true;
                  } else {
                    vscode.window.showErrorMessage(
                      localize("cmd.updateSettings.error.gistNotSave")
                    );
                    return;
                  }
                },
                (error: any) => {
                  Commons.LogException(error, common.ERROR_MESSAGE, true);
                  return;
                }
              );
            } else {
              vscode.window.showErrorMessage(
                localize(
                  "cmd.updateSettings.error.readGistFail",
                  syncSetting.gist
                )
              );
              return;
            }
          },
          (gistReadError: any) => {
            Commons.LogException(gistReadError, common.ERROR_MESSAGE, true);
            return;
          }
        );

        if (completed) {
          await common.SaveSettings(syncSetting).then(
            (added: boolean) => {
              if (added) {
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
                  common.ShowSummmaryOutput(
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
            },
            (err: any) => {
              Commons.LogException(err, common.ERROR_MESSAGE, true);
              return;
            }
          );
        }
      }
    }
  );

  const downloadSettings = vscode.commands.registerCommand(
    "extension.downloadSettings",
    async () => {
      const en: Environment = new Environment(context);
      const common: Commons = new Commons(en, context);
      let myGi: GitHubService = null;
      let localSettings: LocalConfig = new LocalConfig();
      const ignoreSettings = new Object();
      common.CloseWatch();

      try {
        localSettings = await common.InitalizeSettings(true, true);
        // ignoreSettings = await common.GetIgnoredSettings(localSettings.customConfig.ignoreUploadSettings);
        await StartDownload(
          localSettings.extConfig,
          localSettings.customConfig
        );
        // await common.SetIgnoredSettings(ignoreSettings);
      } catch (error) {
        Commons.LogException(error, common.ERROR_MESSAGE, true);
        return;
      }

      async function StartDownload(
        syncSetting: ExtensionConfig,
        customSettings: CustomSettings
      ) {
        myGi = new GitHubService(customSettings.token);
        vscode.window.setStatusBarMessage("").dispose();
        vscode.window.setStatusBarMessage(
          localize("cmd.downloadSettings.info.readdingOnline"),
          2000
        );

        myGi.ReadGist(syncSetting.gist).then(
          async (res: any) => {
            let addedExtensions: ExtensionInformation[] = [];
            let deletedExtensions: ExtensionInformation[] = [];
            const updatedFiles: File[] = [];
            const actionList: Array<Promise<void | boolean>> = [];

            if (res) {
              if (res.data.public === true) {
                localSettings.publicGist = true;
              }
              const keys = Object.keys(res.data.files);
              if (keys.indexOf(en.FILE_CLOUDSETTINGS_NAME) > -1) {
                const cloudSettGist: object = JSON.parse(
                  res.data.files[en.FILE_CLOUDSETTINGS_NAME].content
                );
                const cloudSett: CloudSetting = Object.assign(
                  new CloudSetting(),
                  cloudSettGist
                );

                const lastUploadStr: string = syncSetting.lastUpload
                  ? syncSetting.lastUpload.toString()
                  : "";
                const lastDownloadStr: string = syncSetting.lastDownload
                  ? syncSetting.lastDownload.toString()
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
                syncSetting.lastDownload = cloudSett.lastUpload;
              }

              keys.forEach(gistName => {
                if (res.data.files[gistName]) {
                  if (res.data.files[gistName].content) {
                    if (gistName.indexOf(".") > -1) {
                      if (
                        en.OsType === OsType.Mac &&
                        gistName === en.FILE_KEYBINDING_DEFAULT
                      ) {
                        return;
                      }
                      if (
                        en.OsType !== OsType.Mac &&
                        gistName === en.FILE_KEYBINDING_MAC
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
                  if (file.gistName === en.FILE_EXTENSION_NAME) {
                    if (syncSetting.syncExtensions) {
                      if (
                        customSettings.ignoreExtensions &&
                        customSettings.ignoreExtensions.length
                      ) {
                        const extList = ExtensionInformation.fromJSONList(
                          content
                        );
                        const newExtList = extList.filter(
                          extension =>
                            !customSettings.ignoreExtensions.includes(
                              extension.name
                            )
                        );
                        content = JSON.stringify(newExtList);
                      }

                      if (syncSetting.removeExtensions) {
                        try {
                          deletedExtensions = await PluginService.DeleteExtensions(
                            content,
                            en.ExtensionFolder
                          );
                        } catch (uncompletedExtensions) {
                          vscode.window.showErrorMessage(
                            localize("cmd.downloadSettings.error.removeExtFail")
                          );
                          deletedExtensions = uncompletedExtensions;
                        }
                      }
                      try {
                        addedExtensions = await PluginService.InstallExtensions(
                          content,
                          en.ExtensionFolder,
                          (message: string, dispose: boolean) => {
                            // TODO:
                            if (dispose) {
                              vscode.window.setStatusBarMessage(message, 2000);
                            } else {
                              vscode.window.setStatusBarMessage(message, 5000);
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
                      file.gistName === en.FILE_KEYBINDING_DEFAULT ||
                      file.gistName === en.FILE_KEYBINDING_MAC
                    ) {
                      let test: string = "";
                      en.OsType === OsType.Mac
                        ? (test = en.FILE_KEYBINDING_MAC)
                        : (test = en.FILE_KEYBINDING_DEFAULT);
                      if (file.gistName !== test) {
                        writeFile = false;
                      }
                    }
                    if (writeFile) {
                      if (file.gistName === en.FILE_KEYBINDING_MAC) {
                        file.fileName = en.FILE_KEYBINDING_DEFAULT;
                      }
                      const filePath: string = await FileService.CreateDirTree(
                        en.USER_FOLDER,
                        file.fileName
                      );
                      await actionList.push(
                        FileService.WriteFile(filePath, content).then(
                          (added: boolean) => {
                            // TODO : add Name attribute in File and show information message here with name , when required.
                          },
                          (error: any) => {
                            Commons.LogException(
                              error,
                              common.ERROR_MESSAGE,
                              true
                            );
                            return;
                          }
                        )
                      );
                    }
                  }
                }
              }
            } else {
              Commons.LogException(res, "Sync : Unable to Read Gist.", true);
            }

            Promise.all(actionList)
              .then(async () => {
                // if (!syncSetting.showSummary) {
                //     if (missingList.length == 0) {
                //         //vscode.window.showInformationMessage("No extension need to be installed");
                //     }
                //     else {
                //         //extension message when summary is turned off
                //         vscode.window.showInformationMessage("Sync : " + missingList.length + " extensions installed Successfully, Restart Required.");
                //     }
                //     if (deletedExtensions.length > 0) {
                //         vscode.window.showInformationMessage("Sync : " + deletedExtensions.length + " extensions deleted Successfully, Restart Required.");
                //     }
                // }

                await common.SaveSettings(syncSetting).then(
                  async (added: boolean) => {
                    if (added) {
                      if (!syncSetting.quietSync) {
                        common.ShowSummmaryOutput(
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
                      if (
                        Object.keys(customSettings.replaceCodeSettings).length >
                        0
                      ) {
                        const config = vscode.workspace.getConfiguration();
                        const keysDefined: string[] = Object.keys(
                          customSettings.replaceCodeSettings
                        );
                        keysDefined.forEach((key: string, index: number) => {
                          const value: string =
                            customSettings.replaceCodeSettings[key];
                          const c: any = value === "" ? undefined : value;
                          config.update(key, c, true);
                        });
                      }
                      if (syncSetting.autoUpload) {
                        common.StartWatch();
                      }
                    } else {
                      vscode.window.showErrorMessage(
                        localize("cmd.downloadSettings.error.unableSave")
                      );
                    }
                  },
                  (errSave: any) => {
                    Commons.LogException(errSave, common.ERROR_MESSAGE, true);
                    return;
                  }
                );
              })
              .catch(e => {
                Commons.LogException(e, common.ERROR_MESSAGE, true);
              });
          },
          (err: any) => {
            Commons.LogException(err, common.ERROR_MESSAGE, true);
            return;
          }
        );
      }
    }
  );

  const resetSettings = vscode.commands.registerCommand(
    "extension.resetSettings",
    async () => {
      let extSettings: ExtensionConfig = null;
      let localSettings: CustomSettings = null;
      await Init();

      async function Init() {
        vscode.window.setStatusBarMessage(
          localize("cmd.resetSettings.info.resetting"),
          2000
        );

        try {
          const en: Environment = new Environment(context);
          const common: Commons = new Commons(en, context);

          extSettings = new ExtensionConfig();
          localSettings = new CustomSettings();

          const extSaved: boolean = await common.SaveSettings(extSettings);
          const customSaved: boolean = await common.SetCustomSettings(
            localSettings
          );
          const lockExist: boolean = await FileService.FileExists(
            en.FILE_SYNC_LOCK
          );

          if (!lockExist) {
            fs.closeSync(fs.openSync(en.FILE_SYNC_LOCK, "w"));
          }

          const locked: boolean = lockfile.checkSync(en.FILE_SYNC_LOCK);
          if (locked) {
            lockfile.unlockSync(en.FILE_SYNC_LOCK);
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
    }
  );

  const howSettings = vscode.commands.registerCommand(
    "extension.HowSettings",
    async () => {
      vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.parse(
          "http://shanalikhan.github.io/2015/12/15/Visual-Studio-Code-Sync-Settings.html"
        )
      );
    }
  );

  const otherOptions = vscode.commands.registerCommand(
    "extension.otherOptions",
    async () => {
      const en: Environment = new Environment(context);
      const common: Commons = new Commons(en, context);
      const setting: ExtensionConfig = await common.GetSettings();
      const customSettings: CustomSettings = await common.GetCustomSettings();
      const localSetting: LocalConfig = new LocalConfig();
      const tokenAvailable: boolean =
        customSettings.token != null && customSettings.token !== "";
      const gistAvailable: boolean =
        setting.gist != null && setting.gist !== "";

      const items: string[] = [];
      items.push(localize("cmd.otherOptions.editLocalSetting"));
      items.push(localize("cmd.otherOptions.shareSetting"));
      items.push(localize("cmd.otherOptions.downloadSetting"));
      items.push(localize("cmd.otherOptions.toggleForceDownload"));
      items.push(localize("cmd.otherOptions.toggleAutoUpload"));
      items.push(localize("cmd.otherOptions.toggleAutoDownload"));
      items.push(localize("cmd.otherOptions.toggleSummaryPage"));
      items.push(localize("cmd.otherOptions.preserve"));
      items.push(localize("cmd.otherOptions.joinCommunity"));
      items.push(localize("cmd.otherOptions.openIssue"));
      items.push(localize("cmd.otherOptions.releaseNotes"));

      let selectedItem: number = 0;
      let settingChanged: boolean = false;

      vscode.window
        .showQuickPick(items)
        .then(
          async (resolve: string) => {
            switch (resolve) {
              case items[0]: {
                // extension local settings
                const file: vscode.Uri = vscode.Uri.file(
                  en.FILE_CUSTOMIZEDSETTINGS
                );
                fs.openSync(file.fsPath, "r");
                await vscode.workspace
                  .openTextDocument(file)
                  .then((a: vscode.TextDocument) => {
                    vscode.window.showTextDocument(
                      a,
                      vscode.ViewColumn.One,
                      true
                    );
                  });
                break;
              }
              case items[1]: {
                // share public gist
                await vscode.window
                  .showInformationMessage(
                    localize("cmd.otherOptions.shareSetting.beforeConfirm"),
                    "Yes"
                  )
                  .then(
                    async data => {
                      if (data === "Yes") {
                        localSetting.publicGist = true;
                        settingChanged = true;
                        setting.gist = "";
                        selectedItem = 1;
                        customSettings.downloadPublicGist = false;
                        const done: boolean = await common.SetCustomSettings(
                          customSettings
                        );
                      }
                    },
                    reject => {
                      return;
                    }
                  );
                break;
              }
              case items[2]: {
                // Download Settings from Public GIST
                selectedItem = 2;
                customSettings.downloadPublicGist = true;
                settingChanged = true;
                const done: boolean = await common.SetCustomSettings(
                  customSettings
                );
                break;
              }
              case items[3]: {
                // toggle force download
                selectedItem = 3;
                settingChanged = true;
                if (setting.forceDownload) {
                  setting.forceDownload = false;
                } else {
                  setting.forceDownload = true;
                }
                break;
              }
              case items[4]: {
                // toggle auto upload
                selectedItem = 4;
                settingChanged = true;
                if (setting.autoUpload) {
                  setting.autoUpload = false;
                } else {
                  setting.autoUpload = true;
                }
                break;
              }
              case items[5]: {
                // auto downlaod on startup
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
                if (setting.autoDownload) {
                  setting.autoDownload = false;
                } else {
                  setting.autoDownload = true;
                }
                break;
              }
              case items[6]: {
                // page summary toggle
                selectedItem = 6;
                settingChanged = true;

                if (!tokenAvailable || !gistAvailable) {
                  vscode.commands.executeCommand("extension.HowSettings");
                  return;
                }
                if (setting.quietSync) {
                  setting.quietSync = false;
                } else {
                  setting.quietSync = true;
                }
                break;
              }

              case items[7]: {
                // preserve
                const options: vscode.InputBoxOptions = {
                  ignoreFocusOut: true,
                  placeHolder: localize(
                    "cmd.otherOptions.preserve.placeholder"
                  ),
                  prompt: localize("cmd.otherOptions.preserve.prompt")
                };
                vscode.window.showInputBox(options).then(async res => {
                  if (res) {
                    const settingKey: string = res;
                    const a = vscode.workspace.getConfiguration();
                    const val: string = a.get<string>(settingKey);
                    customSettings.replaceCodeSettings[res] = val;
                    const done: boolean = await common.SetCustomSettings(
                      customSettings
                    );
                    if (done) {
                      if (val === "") {
                        vscode.window.showInformationMessage(
                          localize("cmd.otherOptions.preserve.info.done1", res)
                        );
                      } else {
                        vscode.window.showInformationMessage(
                          localize(
                            "cmd.otherOptions.preserve.info.done1",
                            res,
                            val
                          )
                        );
                      }
                    }
                  }
                });
                break;
              }
              case items[8]: {
                vscode.commands.executeCommand(
                  "vscode.open",
                  vscode.Uri.parse(
                    "https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk"
                  )
                );
                break;
              }
              case items[9]: {
                vscode.commands.executeCommand(
                  "vscode.open",
                  vscode.Uri.parse(
                    "https://github.com/shanalikhan/code-settings-sync/issues/new"
                  )
                );
                break;
              }
              case items[10]: {
                vscode.commands.executeCommand(
                  "vscode.open",
                  vscode.Uri.parse(
                    "http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html"
                  )
                );
                break;
              }
              default: {
                break;
              }
            }
          },
          reject => {
            Commons.LogException(reject, "Error", true);
            return;
          }
        )
        .then(
          async (resolve: any) => {
            if (settingChanged) {
              if (selectedItem === 1) {
                common.CloseWatch();
              }
              await common.SaveSettings(setting).then(
                async (added: boolean) => {
                  if (added) {
                    switch (selectedItem) {
                      case 5: {
                        if (setting.autoDownload) {
                          vscode.window.showInformationMessage(
                            localize("cmd.otherOptions.toggleAutoDownload.on")
                          );
                        } else {
                          vscode.window.showInformationMessage(
                            localize("cmd.otherOptions.toggleAutoDownload.off")
                          );
                        }
                        break;
                      }
                      case 6: {
                        if (!setting.quietSync) {
                          vscode.window.showInformationMessage(
                            localize("cmd.otherOptions.quietSync.off")
                          );
                        } else {
                          vscode.window.showInformationMessage(
                            localize("cmd.otherOptions.quietSync.on")
                          );
                        }
                        break;
                      }
                      case 3: {
                        if (setting.forceDownload) {
                          vscode.window.showInformationMessage(
                            localize("cmd.otherOptions.toggleForceDownload.on")
                          );
                        } else {
                          vscode.window.showInformationMessage(
                            localize("cmd.otherOptions.toggleForceDownload.off")
                          );
                        }
                        break;
                      }
                      case 4: {
                        if (setting.autoUpload) {
                          vscode.window.showInformationMessage(
                            localize("cmd.otherOptions.toggleAutoUpload.on")
                          );
                        } else {
                          vscode.window.showInformationMessage(
                            localize("cmd.otherOptions.toggleAutoUpload.off")
                          );
                        }
                        break;
                      }
                      case 1: {
                        await vscode.commands.executeCommand(
                          "extension.updateSettings",
                          "publicGIST"
                        );
                        break;
                      }
                      case 2: {
                        vscode.window.showInformationMessage(
                          localize("cmd.otherOptions.warning.tokenNotRequire")
                        );
                      }
                    }
                  } else {
                    vscode.window.showErrorMessage(
                      localize("cmd.otherOptions.error.toggleFail")
                    );
                  }
                },
                (err: any) => {
                  Commons.LogException(
                    err,
                    "Sync : Unable to toggle. Please open an issue.",
                    true
                  );
                  return;
                }
              );
            }
          },
          (reject: any) => {
            Commons.LogException(reject, "Error", true);
            return;
          }
        );
    }
  );

  context.subscriptions.push(updateSettings);
  context.subscriptions.push(downloadSettings);
  context.subscriptions.push(resetSettings);
  context.subscriptions.push(howSettings);
  context.subscriptions.push(otherOptions);
}
