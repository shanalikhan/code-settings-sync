import { watch } from "chokidar";
import * as vscode from "vscode";
import Commons from "../commons";
import { Environment } from "../environmentPath";
import lockfile from "../lockfile";
import { CustomSettings } from "../setting";
import { FileService } from "./fileService";

export class AutoUploadService {
  public watching = false;
  private watcher = watch(this.options.en.USER_FOLDER, {
    depth: 2,
    ignored: this.GetIgnoredItems()
  });

  constructor(private options: { en: Environment; commons: Commons }) {
    vscode.extensions.onDidChange(async () => {
      if (this.watching) {
        console.log("Sync: Extensions changed");
        if (await lockfile.Check(this.options.en.FILE_SYNC_LOCK)) {
          return;
        }
        await lockfile.Lock(this.options.en.FILE_SYNC_LOCK);
        const customSettings: CustomSettings = await this.options.commons.GetCustomSettings();
        if (customSettings) {
          await this.InitiateAutoUpload();
        }
        return await lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
      }
    });
  }

  public GetIgnoredItems() {
    const ignoredItems = [];
    this.options.commons.GetCustomSettings().then(customSettings => {
      ignoredItems.push(
        customSettings.ignoreUploadFolders.map(folder => `**/${folder}/**`),
        customSettings.ignoreUploadFiles.map(file => `**/${file}`)
      );
    });
    return ignoredItems;
  }

  public async StartWatching() {
    this.StopWatching();

    this.watching = true;

    this.watcher.addListener("all", async (event: string, path: string) => {
      console.log(
        `Sync: ${FileService.ExtractFileName(path)} triggered event: ${event}`
      );
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
    });
  }

  public StopWatching() {
    if (this.watcher) {
      this.watcher.removeAllListeners();
    }
    this.watching = false;
  }

  private async InitiateAutoUpload() {
    vscode.commands.executeCommand("extension.updateSettings", "forceUpdate");
  }
}
