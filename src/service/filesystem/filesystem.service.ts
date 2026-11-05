import { promises as fs } from "fs";
import * as path from "path";
import { CustomConfig } from "../../models/customConfig.model";
import { LocalConfig } from "../../models/localConfig.model";
import { SyncClient, SyncHistory } from "../../models/syncClient.model";
import { File, FileService } from "../file.service";
import { GistService } from "../github/gist.service";
import { FileSystemStore } from "./filesystemStore";

export class FileSystemService extends GistService {
  protected isRemote = false;

  protected HasConfiguration(config: LocalConfig): boolean {
    return !!(
      config.customConfig.fileSystem &&
      config.customConfig.fileSystem.folder &&
      path.isAbsolute(config.customConfig.fileSystem.folder)
    );
  }

  protected OpenConfiguration(config: LocalConfig) {
    this.state.commons.webviewService.OpenSettingsPage(
      config.customConfig,
      config.extConfig
    );
  }

  protected GetHistory(config: LocalConfig): SyncHistory {
    return config.customConfig.fileSystem;
  }

  protected SaveSyncConfiguration(): Promise<boolean> {
    // Filesystem transfers do not change Gist configuration or global sync options.
    return Promise.resolve(true);
  }

  protected async ValidateImportFiles(files: File[]): Promise<void> {
    // Validate the entire batch before creating directories or starting writes.
    for (const file of files) {
      const name =
        file.gistName === this.state.environment.FILE_KEYBINDING_MAC
          ? this.state.environment.FILE_KEYBINDING_DEFAULT
          : file.fileName;
      const target =
        file.filePath ||
        path.join(this.state.environment.USER_FOLDER, ...name.split("|"));
      if (!path.isAbsolute(target)) {
        throw new Error("A filesystem import target must be an absolute path.");
      }
      let current = path.parse(target).root;
      const parts = path.relative(current, target).split(path.sep);
      for (const part of parts) {
        current = path.join(current, part);
        try {
          const stat = await fs.lstat(current);
          if (stat.isSymbolicLink()) {
            throw new Error(
              "A filesystem import target contains a symbolic link."
            );
          }
        } catch (error) {
          if (error.code === "ENOENT") {
            break;
          }
          throw error;
        }
      }
    }
  }

  protected async CreateClient(
    config: LocalConfig,
    allowMissing = false
  ): Promise<SyncClient> {
    const configured = config.customConfig.fileSystem.folder.trim();
    if (!path.isAbsolute(configured)) {
      throw new Error("The filesystem sync folder must be an absolute path.");
    }
    const userFolder = await fs.realpath(this.state.environment.USER_FOLDER);
    let existing = configured;
    const missing: string[] = [];
    let folder: string;
    while (!folder) {
      try {
        folder = path.join(await fs.realpath(existing), ...missing);
      } catch (error) {
        const parent = path.dirname(existing);
        if (error.code !== "ENOENT" || parent === existing) {
          throw error;
        }
        missing.unshift(path.basename(existing));
        existing = parent;
      }
    }
    const relative = path.relative(userFolder, folder);
    if (
      !relative ||
      (!path.isAbsolute(relative) &&
        relative !== ".." &&
        !relative.startsWith(".." + path.sep))
    ) {
      throw new Error(
        "The filesystem sync folder must be outside the VS Code User folder."
      );
    }
    if (allowMissing) {
      await fs.mkdir(folder, { recursive: true });
    }
    return new FileSystemStore(folder, allowMissing);
  }

  protected async ListSyncFiles(config: CustomConfig): Promise<File[]> {
    const files = await FileService.ListFiles(
      this.state.environment.USER_FOLDER,
      config
    );
    return files
      .filter(file => !!file)
      .map(file => {
        const relative = path.relative(
          this.state.environment.USER_FOLDER,
          file.filePath
        );
        if (
          path.isAbsolute(relative) ||
          relative === ".." ||
          relative.startsWith(".." + path.sep)
        ) {
          throw new Error("A settings file is outside the User folder.");
        }
        file.gistName = relative.split(path.sep).join("|");
        return file;
      });
  }

  private async WithWatcher(action: () => Promise<void>): Promise<void> {
    const watcher = this.state.watcher;
    const wasWatching =
      watcher.autoUploadService && watcher.autoUploadService.watching;
    try {
      await action();
    } finally {
      if (wasWatching && !watcher.autoUploadService.watching) {
        await watcher.HandleStartWatching();
      }
    }
  }

  public Export(args?: unknown[]): Promise<void> {
    return this.WithWatcher(() => super.Export(args));
  }

  public Import(args?: unknown[]): Promise<void> {
    return this.WithWatcher(() => super.Import(args));
  }

  public async IsConfigured(): Promise<boolean> {
    return this.HasConfiguration(await this.state.commons.InitalizeSettings());
  }

  public Reset(): Promise<void> {
    // Resetting the extension must not delete a shared settings bundle.
    return Promise.resolve();
  }
}
