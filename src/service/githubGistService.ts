
"use strict";

import { GitHubService } from "./githubService";
import { File } from "./fileService";
import { Environment } from "../environmentPath";
import { ExtensionConfig, CustomSettings, CloudSetting, LocalConfig } from "../setting";
import Commons from "../commons";
import * as vscode from "vscode";
import localize from "../localize";

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
}