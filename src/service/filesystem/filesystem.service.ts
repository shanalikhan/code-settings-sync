import * as fs from "fs-extra";
import * as path from "path";
import * as vscode from "vscode";
import { OsType } from "../../enums/osType.enum";
import { ISyncService } from "../../models/ISyncService.model";
import { LocalConfig } from "../../models/localConfig.model";
import { IExtensionState } from "../../models/state.model";
import PragmaUtil from "../../pragmaUtil";
import { FileService } from "../file.service";
import { preserveLocalSyncSettings } from "../syncSettings";
import { ExtensionInformation, PluginService } from "../plugin.service";
import {
  destinationKey,
  FileSystemStore,
  isWithin,
  parseSnapshot,
  realDestination,
  Snapshot,
  validateName
} from "./store";

export class FileSystemService implements ISyncService {
  constructor(private state: IExtensionState) {}

  public async IsConfigured(): Promise<boolean> {
    const config = await this.state.commons.GetCustomSettings();
    return !!config.fileSystemPath && path.isAbsolute(config.fileSystemPath);
  }

  /** Reset configuration only; never delete a user's backup. */
  public async Reset(): Promise<void> {
    const config = await this.state.commons.GetCustomSettings();
    config.fileSystemPath = "";
    await this.state.commons.SetCustomSettings(config);
  }

  public async Export(): Promise<void> {
    const config = await this.state.commons.InitalizeSettings();
    const store = await this.store(config);
    await this.state.watcher.HandleStopWatching();
    try {
      const previous = await store.read();
      const files: { [name: string]: string } = Object.create(null);
      const env = this.state.environment;
      const custom = config.customConfig;
      for (const file of await FileService.ListFiles(env.USER_FOLDER, custom)) {
        if (
          file.fileName === env.FILE_KEYBINDING_MAC ||
          file.fileName === env.FILE_EXTENSION_NAME ||
          file.fileName === env.FILE_CUSTOMIZEDSETTINGS_NAME
        ) {
          continue;
        }
        // Derive names from the actual user root, not a folder named "User".
        const realFile = await fs.realpath(file.filePath);
        if (!isWithin(await fs.realpath(env.USER_FOLDER), realFile)) {
          throw new Error(
            "A settings file points outside the user folder: " + file.fileName
          );
        }
        let name = path
          .relative(env.USER_FOLDER, file.filePath)
          .split(path.sep)
          .join("|");
        if (
          name === env.FILE_KEYBINDING_NAME &&
          env.OsType === OsType.Mac &&
          !custom.universalKeybindings
        ) {
          name = env.FILE_KEYBINDING_MAC;
        }
        validateName(name);
        files[name] = this.isPragmaFile(name)
          ? await PragmaUtil.processBeforeUpload(file.content)
          : file.content;
      }
      for (const name of Object.keys(custom.customFiles)) {
        const snapshotName = FileService.CUSTOMIZED_SYNC_PREFIX + name;
        validateName(snapshotName);
        const file = await FileService.GetCustomFile(
          custom.customFiles[name],
          name
        );
        if (file) {
          files[snapshotName] = file.content;
        }
      }
      if (config.extConfig.syncExtensions) {
        files[env.FILE_EXTENSION_NAME] = JSON.stringify(
          PluginService.CreateExtensionList()
            .filter(
              extension => !custom.ignoreExtensions.includes(extension.name)
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
          null,
          2
        );
      }
      const snapshot: Snapshot = { version: 1, files };
      if (previous !== null) {
        const old = parseSnapshot(previous);
        // Keep the other operating system's keybindings when sharing a folder.
        const otherKeybinding =
          env.OsType === OsType.Mac && !custom.universalKeybindings
            ? env.FILE_KEYBINDING_DEFAULT
            : env.FILE_KEYBINDING_MAC;
        if (!(otherKeybinding in files) && otherKeybinding in old.files) {
          files[otherKeybinding] = old.files[otherKeybinding];
        }
        if (this.sameFiles(old.files, files)) {
          return;
        }
        if (
          !config.extConfig.forceUpload &&
          (await vscode.window.showWarningMessage(
            "Replace the existing filesystem settings snapshot?",
            "Export"
          )) !== "Export"
        ) {
          return;
        }
      }
      await store.write(snapshot, previous);
      this.report(config, "Exported", Object.keys(files).length);
    } finally {
      if (config.extConfig.autoUpload) {
        await this.state.watcher.HandleStartWatching();
      }
    }
  }

  public async Import(): Promise<void> {
    const config = await this.state.commons.InitalizeSettings();
    const store = await this.store(config);
    const text = await store.read();
    if (text === null) {
      throw new Error(
        "No settings-sync.json snapshot exists in the configured folder."
      );
    }
    const snapshot = parseSnapshot(text);
    const env = this.state.environment;
    const custom = config.customConfig;
    const writes: Array<{ target: string; content: string }> = [];
    let extensions: string;
    const userRoot = await fs.realpath(env.USER_FOLDER);
    const settingsTarget = destinationKey(
      await realDestination(path.join(userRoot, env.FILE_SETTING_NAME))
    );
    const seenTargets = new Set<string>();
    for (const name of Object.keys(snapshot.files)) {
      if (name === env.FILE_EXTENSION_NAME) {
        if (config.extConfig.syncExtensions) {
          ExtensionInformation.fromJSONList(snapshot.files[name]);
          extensions = snapshot.files[name];
        }
        continue;
      }
      let target: string;
      const customPrefix = FileService.CUSTOMIZED_SYNC_PREFIX;
      if (name.startsWith(customPrefix)) {
        const key = name.slice(customPrefix.length);
        if (!Object.prototype.hasOwnProperty.call(custom.customFiles, key)) {
          continue;
        }
        target = path.resolve(custom.customFiles[key]);
      } else {
        if (
          name === env.FILE_KEYBINDING_MAC &&
          (env.OsType !== OsType.Mac || custom.universalKeybindings)
        ) {
          continue;
        }
        if (
          name === env.FILE_KEYBINDING_DEFAULT &&
          env.OsType === OsType.Mac &&
          !custom.universalKeybindings
        ) {
          continue;
        }
        target = path.join(
          userRoot,
          ...(name === env.FILE_KEYBINDING_MAC
            ? env.FILE_KEYBINDING_DEFAULT
            : name
          ).split("|")
        );
        if (!isWithin(userRoot, await realDestination(target))) {
          throw new Error(
            "A snapshot destination points outside the user folder: " + name
          );
        }
      }
      const canonicalTarget = destinationKey(await realDestination(target));
      if (
        seenTargets.has(canonicalTarget) ||
        canonicalTarget ===
          destinationKey(await realDestination(env.FILE_CUSTOMIZEDSETTINGS))
      ) {
        throw new Error("Duplicate or reserved snapshot destination: " + name);
      }
      seenTargets.add(canonicalTarget);
      let content = snapshot.files[name];
      if (this.isPragmaFile(name) && (await fs.pathExists(target))) {
        content = PragmaUtil.processBeforeWrite(
          await fs.readFile(target, "utf8"),
          content,
          env.OsType,
          custom.hostName
        );
      }
      if (canonicalTarget === settingsTarget) {
        content = preserveLocalSyncSettings(content, config.extConfig);
      }
      writes.push({ target, content });
    }
    if (
      !config.extConfig.forceDownload &&
      (await vscode.window.showWarningMessage(
        "Import the filesystem snapshot and replace the matching local settings?",
        "Import"
      )) !== "Import"
    ) {
      return;
    }
    await this.state.watcher.HandleStopWatching();
    try {
      for (const write of writes) {
        await fs.outputFile(write.target, write.content, "utf8");
      }
      if (extensions !== undefined) {
        if (config.extConfig.removeExtensions) {
          await PluginService.DeleteExtensions(
            extensions,
            custom.ignoreExtensions
          );
        }
        const result = await PluginService.InstallExtensions(
          extensions,
          custom.ignoreExtensions,
          message => console.log(message)
        );
        if (result.failedExtensions.length) {
          throw new Error(
            "Settings imported, but some extensions failed to install. Retry the import."
          );
        }
      }
      // Retain this machine's sync options after importing settings.json.
      if (!(await this.state.commons.SaveSettings(config.extConfig))) {
        throw new Error(
          "Settings imported, but the local sync configuration could not be saved."
        );
      }
      this.report(config, "Imported", writes.length);
    } finally {
      if (config.extConfig.autoUpload) {
        await this.state.watcher.HandleStartWatching();
      }
    }
  }

  private async store(config: LocalConfig): Promise<FileSystemStore> {
    const store = new FileSystemStore(config.customConfig.fileSystemPath);
    const user = await realDestination(
      path.resolve(this.state.environment.USER_FOLDER)
    );
    const folder = await realDestination(store.folder);
    if (isWithin(user, folder)) {
      throw new Error(
        "Choose a filesystem sync folder outside the VS Code user folder."
      );
    }
    return store;
  }

  private sameFiles(
    left: Snapshot["files"],
    right: Snapshot["files"]
  ): boolean {
    return (
      Object.keys(left).length === Object.keys(right).length &&
      Object.keys(left).every(name => left[name] === right[name])
    );
  }

  private isPragmaFile(name: string): boolean {
    const env = this.state.environment;
    return [
      env.FILE_SETTING_NAME,
      env.FILE_KEYBINDING_MAC,
      env.FILE_KEYBINDING_DEFAULT
    ].includes(name);
  }

  private report(config: LocalConfig, action: string, count: number) {
    const message = `Sync: ${action} ${count} files using ${config.customConfig.fileSystemPath}`;
    vscode.window.setStatusBarMessage(message, 5000);
    if (!config.extConfig.quietSync) {
      void vscode.window.showInformationMessage(message);
    }
  }
}
