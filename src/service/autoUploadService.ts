import { watch } from "chokidar";
import { resolve } from "path";
import * as vscode from "vscode";
import Commons from "../commons";
import { Environment } from "../environmentPath";
import lockfile from "../lockfile";
import { CustomSettings } from "../setting";
import { FileService } from "./fileService";

export class AutoUploadService {
  private watcher = watch(this.options.en.USER_FOLDER, {
    depth: 2,
    ignored: this.options.commons.GetCustomSettings().ignoredItems.map(item => {
      if (FileService.IsDirectory(resolve(this.options.en.USER_FOLDER, item))) {
        return `**/${item}/**`;
      } else {
        return `**/${item}`;
      }
    })
  });

  constructor(private options: { en: Environment; commons: Commons }) {}

  public async StartWatching() {
    this.StopWatching();
    vscode.extensions.onDidChange(async () => {
      if (await lockfile.Check(this.options.en.FILE_SYNC_LOCK)) {
        return;
      }
      await lockfile.Lock(this.options.en.FILE_SYNC_LOCK);
      const customSettings: CustomSettings = await this.options.commons.GetCustomSettings();
      if (customSettings) {
        await this.InitiateAutoUpload();
      }
      return await lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
    });

    this.watcher.addListener("all", async (event: string, path: string) => {
      console.log(
        `Sync: ${FileService.ExtractFileName(path)} triggered event ${event}`
      );
      if (await lockfile.Check(this.options.en.FILE_SYNC_LOCK)) {
        return;
      } else {
        await lockfile.Lock(this.options.en.FILE_SYNC_LOCK);
      }

      const customSettings: CustomSettings = await this.options.commons.GetCustomSettings();
      if (customSettings) {
        if (customSettings.syncMethod === "gist") {
          const fileType: string = path
            .substring(path.lastIndexOf("."), path.length)
            .slice(1);
          console.log(fileType);
          if (
            customSettings.gistSettings.supportedFileExtensions.indexOf(
              fileType
            ) !== -1
          ) {
            await this.InitiateAutoUpload();
          }
        } else {
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
  }

  private async InitiateAutoUpload() {
    vscode.commands.executeCommand("extension.updateSettings", "forceUpdate");
  }
}
