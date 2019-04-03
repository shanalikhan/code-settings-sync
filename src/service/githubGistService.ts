
"use strict";

import { GitHubService } from "./githubService";
import { File, FileService } from "./fileService";
import { Environment } from "../environmentPath";
import { ExtensionConfig, CustomSettings, CloudSetting, LocalConfig } from "../setting";
import Commons from "../commons";
import * as vscode from "vscode";
import localize from "../localize";
import { ExtensionInformation, PluginService } from "./pluginService";
import { OsType } from "../enums";
import PragmaUtil from "../pragmaUtil";

export class GitHubGistService extends GitHubService {
  public async Upload(
    allSettingFiles: File[],
    dateNow: Date,
    env?: Environment,
    common?: Commons,
    localConfig?: LocalConfig,
    syncSetting?: ExtensionConfig,
    customSettings?: CustomSettings
  ): Promise<string> {
    const extProp: CloudSetting = new CloudSetting();
    extProp.lastUpload = dateNow;
    const fileName: string = env.FILE_CLOUDSETTINGS_NAME;
    const fileContent: string = JSON.stringify(extProp);
    const file: File = new File(fileName, fileContent, "", fileName);
    allSettingFiles.push(file);

    let gistID: string = syncSetting.gist;
    let settingsUpdated: boolean = false;
    try {
      let newGIST: boolean = false;
      let completed: boolean = false;
      if (syncSetting.gist == null || syncSetting.gist === "") {
        if (customSettings.gistSettings.askGistName) {
          customSettings.gistSettings.gistDescription = await common.AskGistName();
        }
        newGIST = true;
        const gistID = await this.CreateEmptyGIST(
          localConfig.publicGist,
          customSettings.gistSettings.gistDescription
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
      let gistObj = await this.ReadGist(syncSetting.gist);
      if (!gistObj) {
        vscode.window.showErrorMessage(
          localize("cmd.updateSettings.error.readGistFail", syncSetting.gist)
        );
        return;
      }

      if (gistObj.data.owner !== null) {
        const gistOwnerName: string = gistObj.data.owner.login.trim();
        if (this.userName != null) {
          const userName: string = this.userName.trim();
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
      gistObj = this.UpdateGIST(gistObj, allSettingFiles);
      completed = await this.SaveGIST(gistObj.data);
      if (!completed) {
        vscode.window.showErrorMessage(
          localize("cmd.updateSettings.error.gistNotSave")
        );
        return;
      }

      settingsUpdated = await common.SaveSettings(syncSetting);
      if (settingsUpdated) {
        if (newGIST) {
          gistID = syncSetting.gist;
        }
      }
    } catch (err) {
      Commons.LogException(err, common.ERROR_MESSAGE, true);
      return;
    }

    return Promise.resolve(gistID);
  }

  public async Download(
    env: Environment,
    syncSetting: ExtensionConfig,
    customSettings: CustomSettings,
    localConfig?: LocalConfig,
    common?: Commons
  ): Promise<any> {
    const res = await this.ReadGist(syncSetting.gist);

    if (!res) {
      Commons.LogException(res, "Sync : Unable to Read Gist.", true);
      return null;
    }

    let addedExtensions: ExtensionInformation[] = [];
    let deletedExtensions: ExtensionInformation[] = [];
    const ignoredExtensions: string[] =
      customSettings.ignoreExtensions || new Array<string>();
    const updatedFiles: File[] = [];
    const actionList: Array<Promise<void | boolean>> = [];

    if (res.data.public === true) {
      localConfig.publicGist = true;
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
              return null;
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
                localConfig.customConfig.gistSettings.hostName
              );
            }

            actionList.push(
              FileService.WriteFile(filePath, content)
                .then(() => {
                  // TODO : add Name attribute in File and show information message here with name , when required.
                })
                .catch(err => {
                  Commons.LogException(err, common.ERROR_MESSAGE, true);
                  return null;
                })
            );
          }
        }
      }
    }

    await Promise.all(actionList);
    const settingsUpdated: boolean = await common.SaveSettings(syncSetting);
    if (!settingsUpdated) {
      return null;
    }

    return Promise.resolve([updatedFiles, addedExtensions, deletedExtensions]);
  }
}