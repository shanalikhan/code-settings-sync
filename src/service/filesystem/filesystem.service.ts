import * as path from "path";
import * as vscode from "vscode";

import Commons from "../../commons";
import { OsType } from "../../enums/osType.enum";
import { SyncMethod } from "../../enums/syncMethod.enum";
import localize from "../../localize";
import { FileSystemConfig } from "../../models/fileSystem.model";
import { ISyncService } from "../../models/ISyncService.model";
import { LocalConfig } from "../../models/localConfig.model";
import { IExtensionState } from "../../models/state.model";
import PragmaUtil from "../../pragmaUtil";
import { EditorService } from "../editor.service";
import { HasDirtyDocument } from "../editorMatch";
import { File, FileService } from "../file.service";
import {
  ExtensionInformation,
  InstalledExtensionsSummary,
  PluginService
} from "../plugin.service";
import {
  CheckFolder,
  CUSTOM_PREFIX,
  DestinationKey,
  ExportName,
  FolderProblem,
  FolderStore,
  HasNewerExport,
  ImportName,
  IsUpToDate,
  METADATA_FILE,
  KEYBINDINGS,
  KEYBINDINGS_MAC,
  ToFileName,
  ToRelativePath
} from "./folderStore";

/**
 * Exports the synced settings to a plain folder (for example inside OneDrive,
 * Dropbox or a network share) and imports them back, as an alternative to a
 * GitHub Gist. The folder is fileSystemSettings.path in syncLocalSettings.json.
 */
export class FileSystemService implements ISyncService {
  /**
   * Asks for a folder, checks it and makes File System the sync method.
   * Returns the folder, or "" when the dialog was cancelled or the folder was rejected.
   */
  public static async SelectFolder(state: IExtensionState): Promise<string> {
    const customSettings = await state.commons.GetCustomSettings();
    if (!customSettings) {
      return "";
    }
    const current = customSettings.fileSystemSettings.path;
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri:
        current && path.isAbsolute(current)
          ? vscode.Uri.file(current)
          : undefined,
      openLabel: localize("cmd.selectFileSystemFolder.openLabel")
    });
    if (!picked || picked.length === 0) {
      return "";
    }
    const folder = picked[0].fsPath;
    const problem = await CheckFolder(folder, state.environment.USER_FOLDER);
    if (problem) {
      vscode.window.showErrorMessage(
        FileSystemService.ProblemMessage(problem, folder)
      );
      return "";
    }
    if (folder !== current) {
      // Timestamps belong to the previous folder.
      customSettings.fileSystemSettings = new FileSystemConfig();
    }
    customSettings.fileSystemSettings.path = folder;
    customSettings.syncMethod = SyncMethod.FileSystem;
    if (!(await state.commons.SetCustomSettings(customSettings))) {
      return "";
    }
    state.commons.webviewService.UpdateSettingsPage(
      customSettings,
      state.commons.GetSettings()
    );
    vscode.window.showInformationMessage(
      localize("cmd.selectFileSystemFolder.done", folder)
    );
    return folder;
  }

  private static ProblemMessage(problem: FolderProblem, folder: string) {
    const message: string = localize(`cmd.fileSystem.error.${problem}`, folder);
    return message;
  }

  constructor(private state: IExtensionState) {}

  public async IsConfigured(): Promise<boolean> {
    const customSettings = await this.state.commons.GetCustomSettings();
    return (
      !!customSettings &&
      (await CheckFolder(
        customSettings.fileSystemSettings.path,
        this.state.environment.USER_FOLDER
      )) === null
    );
  }

  /** Forgets the folder. The exported files are left where they are. */
  public async Reset(): Promise<void> {
    const customSettings = await this.state.commons.GetCustomSettings();
    customSettings.fileSystemSettings = new FileSystemConfig();
    customSettings.syncMethod = SyncMethod.GitHubGist;
    await this.state.commons.SetCustomSettings(customSettings);
  }

  public async Export(): Promise<void> {
    const localConfig = await this.state.commons.InitalizeSettings();
    const folder = await this.ResolveFolder(localConfig);
    if (!folder) {
      return;
    }
    await this.state.watcher.HandleStopWatching();
    try {
      await this.StartExport(localConfig, folder);
    } catch (err) {
      Commons.LogException(err, this.ErrorMessage(err), true);
    } finally {
      if (localConfig.extConfig.autoUpload) {
        await this.state.watcher.HandleStartWatching();
      }
    }
  }

  public async Import(): Promise<void> {
    const localConfig = await this.state.commons.InitalizeSettings();
    const folder = await this.ResolveFolder(localConfig);
    if (!folder) {
      return;
    }
    await this.state.watcher.HandleStopWatching();
    try {
      await this.StartImport(localConfig, folder);
    } catch (err) {
      Commons.LogException(err, this.ErrorMessage(err), true);
    } finally {
      if (localConfig.extConfig.autoUpload) {
        await this.state.watcher.HandleStartWatching();
      }
    }
  }

  /** The configured folder, asking for one first when none is set. */
  private async ResolveFolder(localConfig: LocalConfig): Promise<string> {
    let folder = localConfig.customConfig.fileSystemSettings.path;
    if (!folder) {
      folder = await FileSystemService.SelectFolder(this.state);
      if (!folder) {
        return "";
      }
      localConfig.customConfig = await this.state.commons.GetCustomSettings();
    }
    const problem = await CheckFolder(
      folder,
      this.state.environment.USER_FOLDER
    );
    if (problem) {
      vscode.window.showErrorMessage(
        FileSystemService.ProblemMessage(problem, folder)
      );
      return "";
    }
    return folder.trim();
  }

  private async StartExport(
    localConfig: LocalConfig,
    folder: string
  ): Promise<void> {
    const {
      extConfig: syncSetting,
      customConfig: customSettings
    } = localConfig;
    const env = this.state.environment;
    const isMac = env.OsType === OsType.Mac;
    vscode.window.setStatusBarMessage(
      localize("cmd.updateSettings.info.exporting", folder),
      2000
    );

    const files: File[] = [];
    let exportedExtensions: ExtensionInformation[] = [];
    const ignoredExtensions: ExtensionInformation[] = [];
    if (syncSetting.syncExtensions) {
      exportedExtensions = PluginService.CreateExtensionList().filter(
        extension => {
          if (customSettings.ignoreExtensions.includes(extension.name)) {
            ignoredExtensions.push(extension);
            return false;
          }
          return true;
        }
      );
      exportedExtensions.sort((a, b) => a.name.localeCompare(b.name));
      files.push(
        new File(
          env.FILE_EXTENSION_NAME,
          JSON.stringify(exportedExtensions, undefined, 2),
          env.FILE_EXTENSION,
          env.FILE_EXTENSION_NAME
        )
      );
    }

    const userFiles = await FileService.ListFiles(
      env.USER_FOLDER,
      customSettings
    );
    for (const file of userFiles) {
      const relativeName = ToFileName(
        path.relative(env.USER_FOLDER, file.filePath)
      );
      if (
        relativeName === KEYBINDINGS_MAC ||
        relativeName === env.FILE_EXTENSION_NAME
      ) {
        continue;
      }
      const name = ExportName(
        relativeName,
        isMac,
        customSettings.universalKeybindings
      );
      let content = file.content;
      if (
        [env.FILE_SETTING_NAME, KEYBINDINGS, KEYBINDINGS_MAC].includes(name)
      ) {
        content = await PragmaUtil.processBeforeUpload(content);
      }
      files.push(new File(file.fileName, content, file.filePath, name));
    }

    for (const key of Object.keys(customSettings.customFiles)) {
      const customFile = await FileService.GetCustomFile(
        customSettings.customFiles[key],
        key
      );
      if (customFile !== null) {
        files.push(customFile);
      }
    }

    const store = new FolderStore(folder);
    const folderFiles = files.map(file => ({
      name: file.gistName,
      content: file.content
    }));
    const metadata = await store.ReadMetadata();
    const managedKeybinding = ExportName(
      KEYBINDINGS,
      isMac,
      customSettings.universalKeybindings
    );
    const fileSystemSettings = customSettings.fileSystemSettings;
    if (!syncSetting.forceUpload) {
      if (
        metadata &&
        !(await store.HasChanges(folderFiles, metadata, managedKeybinding))
      ) {
        vscode.window.setStatusBarMessage(
          localize("cmd.updateSettings.info.gotLatestVersion"),
          5000
        );
        return;
      }
      if (
        HasNewerExport(
          metadata,
          fileSystemSettings.lastDownload,
          fileSystemSettings.lastUpload
        )
      ) {
        const answer = await vscode.window.showInformationMessage(
          localize("common.prompt.folderNewer", folder),
          localize("common.button.yes"),
          localize("common.button.no")
        );
        if (answer !== localize("common.button.yes")) {
          vscode.window.setStatusBarMessage(
            localize("cmd.updateSettings.info.uploadCanceled"),
            3000
          );
          return;
        }
      }
    }

    const now = new Date();
    await store.Write(
      folderFiles,
      { lastUpload: now, extensionVersion: "v" + env.getVersion() },
      metadata,
      managedKeybinding
    );
    fileSystemSettings.lastUpload = now;
    fileSystemSettings.lastDownload = now;
    await this.state.commons.SetCustomSettings(customSettings);

    vscode.window.setStatusBarMessage("").dispose();
    if (!syncSetting.quietSync) {
      this.state.commons.ShowSummaryOutput(
        true,
        files,
        null,
        new InstalledExtensionsSummary(exportedExtensions, []),
        ignoredExtensions,
        localConfig
      );
    } else {
      vscode.window.setStatusBarMessage(
        localize("cmd.updateSettings.info.exported", folder),
        5000
      );
    }
  }

  private async StartImport(
    localConfig: LocalConfig,
    folder: string
  ): Promise<void> {
    const {
      extConfig: syncSetting,
      customConfig: customSettings
    } = localConfig;
    const env = this.state.environment;
    const isMac = env.OsType === OsType.Mac;
    const store = new FolderStore(folder);
    vscode.window.setStatusBarMessage("").dispose();
    vscode.window.setStatusBarMessage(
      localize("cmd.downloadSettings.info.readingFolder", folder),
      2000
    );

    const metadata = await store.ReadMetadata();
    let folderFiles = await store.ListFiles(customSettings);
    let declaredFiles: Set<string> | null = null;
    // A completed folder export writes the file manifest last. Do not restore
    // undeclared JSON files added by another process, or mark an incomplete
    // export as downloaded when one of its recorded files disappeared.
    if (metadata && metadata.files !== undefined) {
      if (!Array.isArray(metadata.files)) {
        throw new Error("Sync: Export file manifest is invalid.");
      }
      const declared = new Set<string>();
      const destinations = new Set<string>();
      for (const name of metadata.files) {
        if (typeof name !== "string" || name === METADATA_FILE ||
            declared.has(name)) {
          throw new Error("Sync: Export file manifest has invalid or duplicate names.");
        }
        // Reuse the store's traversal and symlink-safe path checks, then
        // reject aliases that become one destination on another machine.
        const destination = DestinationKey(ToRelativePath(name));
        if (destinations.has(destination)) {
          throw new Error("Sync: Export file manifest has invalid or duplicate names.");
        }
        declared.add(name);
        destinations.add(destination);
        if ((await store.ReadFile(name)) === null) {
          throw new Error("Sync: Export is incomplete; a listed settings file is missing.");
        }
      }
      folderFiles = folderFiles.filter(file => declared.has(file.name));
      if (declared.size === 0) {
        throw new Error("Sync: Export manifest contains no settings files.");
      }
      declaredFiles = declared;
    }
    const fileSystemSettings = customSettings.fileSystemSettings;

    const updatedFiles: File[] = [];
    let extensions: string = null;
    for (const file of folderFiles) {
      if (file.name === env.FILE_EXTENSION_NAME) {
        extensions = file.content;
        continue;
      }
      const name = ImportName(
        file.name,
        isMac,
        customSettings.universalKeybindings
      );
      if (name === null) {
        continue;
      }
      updatedFiles.push(
        new File(
          name,
          file.content,
          path.join(env.USER_FOLDER, ToRelativePath(name)),
          file.name
        )
      );
    }
    for (const key of Object.keys(customSettings.customFiles)) {
      const name = CUSTOM_PREFIX + key;
      // Custom files are restored outside USER_FOLDER, so they must obey
      // the same completed-export manifest as ordinary settings files.
      // A missing manifest retains preexisting legacy folder behavior.
      if (declaredFiles && !declaredFiles.has(name)) {
        continue;
      }
      const content = await store.ReadFile(name);
      if (content !== null) {
        updatedFiles.push(
          new File(
            key,
            content,
            customSettings.customFiles[key],
            CUSTOM_PREFIX + key
          )
        );
      }
    }

    // A legacy cloudSettings timestamp is not proof that any settings were
    // exported. Refuse a metadata-only folder BEFORE the up-to-date shortcut,
    // or recording lastDownload can prevent the next real import from running.
    // Custom-only legacy folders are valid if a configured custom file was
    // actually collected into updatedFiles above.
    if (updatedFiles.length === 0 && extensions === null) {
      throw new Error(
        localize("cmd.downloadSettings.error.emptyFolder", folder)
      );
    }

    if (
      !syncSetting.forceDownload &&
      IsUpToDate(
        metadata,
        fileSystemSettings.lastDownload,
        fileSystemSettings.lastUpload
      )
    ) {
      vscode.window.setStatusBarMessage("").dispose();
      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.gotLatestVersion"),
        5000
      );
      return;
    }

    // Check every restore target before creating directories, writing files or
    // changing extensions. Include hidden editors and configured custom files.
    const dirtyFile = updatedFiles.find(file =>
      HasDirtyDocument(vscode.workspace.textDocuments, file.filePath)
    );
    if (dirtyFile) {
      vscode.window.showWarningMessage(
        `Sync : ${dirtyFile.filePath} has unsaved changes in an editor. The folder import was not started. Save or revert it, then import again.`
      );
      return;
    }

    for (const file of updatedFiles) {
      const target = await FileService.CreateCustomDirTree(file.filePath);
      let content = file.content;
      if (
        !file.gistName.startsWith(CUSTOM_PREFIX) &&
        (file.fileName === env.FILE_SETTING_NAME ||
          file.fileName === KEYBINDINGS) &&
        (await FileService.FileExists(target))
      ) {
        content = PragmaUtil.processBeforeWrite(
          await FileService.ReadFile(target),
          content,
          env.OsType,
          customSettings.hostName
        );
      }
      if (!(await EditorService.WriteFile(target, content))) {
        // Do not record the folder as imported when even one restore fails.
        // The next regular import must be able to retry the missing file.
        throw new Error(localize("cmd.downloadSettings.error.writeFile", target));
      }
    }

    let deletedExtensions: ExtensionInformation[] = [];
    let installSummary = new InstalledExtensionsSummary();
    if (extensions !== null && syncSetting.syncExtensions) {
      const ignoredExtensions = customSettings.ignoreExtensions || [];
      if (syncSetting.removeExtensions) {
        deletedExtensions = await PluginService.DeleteExtensions(
          extensions,
          ignoredExtensions
        );
      }
      if (!syncSetting.quietSync) {
        Commons.outputChannel = vscode.window.createOutputChannel(
          "Code Settings Sync"
        );
        Commons.outputChannel.clear();
        Commons.outputChannel.appendLine(`Realtime Extension Download Summary`);
        Commons.outputChannel.appendLine(`--------------------`);
        Commons.outputChannel.show();
      }
      installSummary = await PluginService.InstallExtensions(
        extensions,
        ignoredExtensions,
        (message: string, dispose: boolean) => {
          if (!syncSetting.quietSync) {
            Commons.outputChannel.appendLine(message);
          } else if (dispose) {
            vscode.window.setStatusBarMessage("Sync : " + message, 3000);
          }
        }
      );
    }

    // settings.json was replaced, so put this machine's sync options back.
    // If saving those local options fails, do not persist a "lastDownload"
    // receipt that would suppress the next attempt.
    const settingsSaved = await this.state.commons.SaveSettings(syncSetting);
    if (!settingsSaved) {
      vscode.window.showErrorMessage(
        localize("cmd.downloadSettings.error.unableSave")
      );
      return;
    }
    if (metadata) {
      fileSystemSettings.lastDownload = new Date(metadata.lastUpload);
    }
    const customSettingsSaved = await this.state.commons.SetCustomSettings(
      customSettings
    );
    if (!customSettingsSaved) {
      vscode.window.showErrorMessage(
        localize("cmd.downloadSettings.error.unableSave")
      );
      return;
    }

    vscode.window.setStatusBarMessage("").dispose();
    if (syncSetting.quietSync) {
      vscode.window.setStatusBarMessage(
        localize("cmd.downloadSettings.info.imported", folder),
        5000
      );
      return;
    }
    this.state.commons.ShowSummaryOutput(
      false,
      updatedFiles,
      deletedExtensions,
      installSummary,
      null,
      localConfig
    );
    if (
      deletedExtensions.length > 0 ||
      installSummary.addedExtensions.length > 0
    ) {
      const answer = await vscode.window.showInformationMessage(
        localize("common.prompt.restartCode"),
        "Yes"
      );
      if (answer === "Yes") {
        void vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    }
  }

  private ErrorMessage(err: Error): string {
    return err && err.message ? err.message : this.state.commons.ERROR_MESSAGE;
  }
}
