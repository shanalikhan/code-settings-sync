"use strict";
import * as vscode from "vscode";
import { Environment } from "./environment";
import { CustomConfig } from "./models/customConfig.model";
import { FileService } from "./service/file.service";
import { state } from "./state";

export default class Commons {
  public async StartMigrationProcess(): Promise<boolean> {
    const fileExist: boolean = await FileService.FileExists(
      state.environment.FILE_CUSTOMIZEDSETTINGS
    );
    let customSettings: CustomConfig = null;
    const firstTime: boolean = !fileExist;
    let fileChanged: boolean = firstTime;

    if (fileExist) {
      customSettings = await state.settings.GetCustomSettings();
    } else {
      customSettings = new CustomConfig();
    }
    // vscode.workspace.getConfiguration().update("sync.version", undefined, true);

    if (firstTime) {
      const openExtensionPage = state.localize("common.action.openExtPage");
      vscode.window.showInformationMessage(
        state.localize("common.info.installed")
      );
      vscode.window
        .showInformationMessage(
          state.localize("common.info.needHelp"),
          openExtensionPage
        )
        .then((val: string) => {
          if (val === openExtensionPage) {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync"
              )
            );
          }
        });
    } else if (customSettings.version < Environment.CURRENT_VERSION) {
      fileChanged = true;
      // #TODO : Remove this in new update
      const newIgnoredList = new CustomConfig().ignoreUploadFiles;
      newIgnoredList.forEach(m => {
        if (customSettings.ignoreUploadFiles.indexOf(m) === -1) {
          customSettings.ignoreUploadFiles.push(m);
        }
      });

      if (state.context.globalState.get("synctoken")) {
        const token = state.context.globalState.get("synctoken");
        if (token !== "") {
          customSettings.GitHubGist.token = String(token);
          state.context.globalState.update("synctoken", "");
          vscode.window.showInformationMessage(
            state.localize("common.info.setToken")
          );
        }
      }

      const releaseNotes = state.localize("common.action.releaseNotes");
      const writeReview = state.localize("common.action.writeReview");
      const support = state.localize("common.action.support");
      const joinCommunity = state.localize("common.action.joinCommunity");
      if (!customSettings.disableUpdateMessage) {
        vscode.window
          .showInformationMessage(
            state.localize("common.info.updateTo", Environment.version),
            releaseNotes,
            writeReview,
            support,
            joinCommunity
          )
          .then((val: string) => {
            if (val === releaseNotes) {
              vscode.env.openExternal(
                vscode.Uri.parse(
                  "http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html"
                )
              );
            }
            if (val === writeReview) {
              vscode.env.openExternal(
                vscode.Uri.parse(
                  "https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync#review-details"
                )
              );
            }
            if (val === support) {
              vscode.env.openExternal(
                vscode.Uri.parse(
                  "https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP-DonationsBF:btn_donate_SM.gif:NonHosted"
                )
              );
            }
            if (val === joinCommunity) {
              vscode.env.openExternal(
                vscode.Uri.parse(
                  "https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk"
                )
              );
            }
          });
      }
    }

    if (fileChanged) {
      customSettings.version = Environment.CURRENT_VERSION;
      await state.settings.SetCustomSettings(customSettings);
    }
    return true;
  }

  public async AskGistName(): Promise<string> {
    return vscode.window.showInputBox({
      prompt: state.localize("common.prompt.multipleGist"),
      ignoreFocusOut: true,
      placeHolder: state.localize("common.placeholder.multipleGist")
    });
  }
}
