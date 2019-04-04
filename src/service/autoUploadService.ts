import { watch } from "chokidar";
import * as vscode from "vscode";
import Commons from "../commons";
import { Environment } from "../environmentPath";
import localize from "../localize";
import lockfile from "../lockfile";
import { CustomSettings } from "../setting";
import { Util } from "../util";
import { FileService } from "./fileService";

export class AutoUploadService {
  public static GetIgnoredItems(customSettings: CustomSettings) {
    return [
      ...customSettings.ignoreUploadFolders.map(folder => `**/${folder}/**`),
      ...customSettings.ignoreUploadFiles.map(file => `**/${file}`)
    ];
  }

  public watching = false;

  private watcher = watch(this.options.en.USER_FOLDER, {
    depth: 2,
    ignored: this.options.ignored
  });

  constructor(
    private options: { en: Environment; commons: Commons; ignored: string[] }
  ) {
    vscode.extensions.onDidChange(async () => {
      if (this.watching) {
        console.log("Sync: Extensions changed");
        if (await lockfile.Check(this.options.en.FILE_SYNC_LOCK)) {
          return;
        } else {
          await lockfile.Lock(this.options.en.FILE_SYNC_LOCK);
        }
        const customSettings: CustomSettings = await this.options.commons.GetCustomSettings();
        if (customSettings) {
          await this.InitiateAutoUpload();
        }
        await lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
        return;
      }
    });
  }

  public async StartWatching() {
    this.StopWatching();

    this.watching = true;

    this.watcher.addListener("change", async (path: string) => {
      if (this.watching) {
        console.log(`Sync: ${FileService.ExtractFileName(path)} changed`);
        if (await lockfile.Check(this.options.en.FILE_SYNC_LOCK)) {
          return;
        } else {
          await lockfile.Lock(this.options.en.FILE_SYNC_LOCK);
        }

        const customSettings: CustomSettings = await this.options.commons.GetCustomSettings();
        if (customSettings) {
          const fileType: string = path
            .substring(path.lastIndexOf("."), path.length)
            .slice(1);
          if (customSettings.supportedFileExtensions.indexOf(fileType) !== -1) {
            await this.InitiateAutoUpload();
          }
        }
        await lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
        return;
      }
    });
  }

  public StopWatching() {
    if (this.watcher) {
      this.watcher.removeAllListeners();
    }
    this.watching = false;
  }

  private async InitiateAutoUpload() {
    vscode.window.setStatusBarMessage("").dispose();
    vscode.window.setStatusBarMessage(
      localize("common.info.initAutoUpload"),
      5000
    );

    await Util.Sleep(5000);

    vscode.commands.executeCommand("extension.updateSettings", "forceUpdate");
  }
}
