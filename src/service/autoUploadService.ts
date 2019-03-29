import { FSWatcher } from "chokidar";
import * as vscode from "vscode";
import Commons from "../commons";
import { Environment } from "../environmentPath";
import lockfile from "../lockfile";
import { CustomSettings, ExtensionConfig } from "../setting";

export class AutoUploadService {
  constructor(
    private options: { watcher: FSWatcher; en: Environment; commons: Commons }
  ) {}

  public StartWatching() {
    vscode.extensions.onDidChange(async () => {
      if (await lockfile.Check(this.options.en.FILE_SYNC_LOCK)) {
        return lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
      }

      await lockfile.Lock(this.options.en.FILE_SYNC_LOCK);
      const settings: ExtensionConfig = this.options.commons.GetSettings();
      const customSettings: CustomSettings = await this.options.commons.GetCustomSettings();
      if (customSettings == null) {
        return lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
      }

      const requiredFileChanged: boolean = true;

      console.log("Sync: Folder Change Detected");

      if (requiredFileChanged) {
        if (settings.autoUpload) {
          console.log("Sync: Initiating Auto-upload");
          this.InitiateAutoUpload()
            .then(() => {
              return lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
            })
            .catch(() => {
              return lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
            });
        }
      } else {
        await lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
      }
    });

    this.options.watcher.on("change", async (path: string) => {
      // check sync is locking
      if (await lockfile.Check(this.options.en.FILE_SYNC_LOCK)) {
        return lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
      }

      await lockfile.Lock(this.options.en.FILE_SYNC_LOCK);
      const settings: ExtensionConfig = this.options.commons.GetSettings();
      const customSettings: CustomSettings = await this.options.commons.GetCustomSettings();
      if (customSettings == null) {
        return lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
      }

      let requiredFileChanged: boolean = false;
      if (
        customSettings.gistSettings.ignoreUploadFolders.indexOf(
          "workspaceStorage"
        ) === -1
      ) {
        requiredFileChanged =
          path.indexOf(this.options.en.FILE_SYNC_LOCK_NAME) === -1 &&
          path.indexOf(".DS_Store") === -1 &&
          path.indexOf(this.options.en.FILE_CUSTOMIZEDSETTINGS_NAME) === -1;
      } else {
        requiredFileChanged =
          path.indexOf(this.options.en.FILE_SYNC_LOCK_NAME) === -1 &&
          path.indexOf("workspaceStorage") === -1 &&
          path.indexOf(".DS_Store") === -1 &&
          path.indexOf(this.options.en.FILE_CUSTOMIZEDSETTINGS_NAME) === -1;
      }

      console.log("Sync: File Change Detected On : " + path);

      if (requiredFileChanged) {
        if (settings.autoUpload) {
          if (
            customSettings.gistSettings.ignoreUploadFolders.indexOf(
              "workspaceStorage"
            ) > -1
          ) {
            const fileType: string = path.substring(
              path.lastIndexOf("."),
              path.length
            );
            if (fileType.indexOf("json") === -1) {
              console.log(
                "Sync: Cannot Initiate Auto-upload on This File (Not JSON)."
              );
              return lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
            }
          }

          console.log("Sync: Initiating Auto-upload For File : " + path);
          this.InitiateAutoUpload()
            .then(() => {
              return lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
            })
            .catch(() => {
              return lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
            });
        }
      } else {
        await lockfile.Unlock(this.options.en.FILE_SYNC_LOCK);
      }
    });
  }

  public StopWatching() {
    if (this.options.watcher) {
      this.options.watcher.close();
    }
  }

  private async InitiateAutoUpload() {
    return;
  }
}
