"use strict";
import * as fs from "fs-extra";
import * as path from "path";
import * as vscode from "vscode";

import { state } from "../state";

export class ExtensionInformation {
  public static fromJSON(text: string) {
    try {
      // TODO: JSON.parse may throw error
      // Throw custom error should be more friendly
      const obj = JSON.parse(text);
      const meta = new ExtensionMetadata(
        obj.meta.galleryApiUrl,
        obj.meta.id,
        obj.meta.downloadUrl,
        obj.meta.publisherId,
        obj.meta.publisherDisplayName,
        obj.meta.date
      );
      const item = new ExtensionInformation();
      item.metadata = meta;
      item.name = obj.name;
      item.publisher = obj.publisher;
      item.version = obj.version;
      item.disabled = obj.disabled || false;
      return item;
    } catch (err) {
      throw new Error(err);
    }
  }

  public static fromJSONList(text: string) {
    const extList: ExtensionInformation[] = [];
    try {
      // TODO: JSON.parse may throw error
      // Throw custom error should be more friendly
      const list = JSON.parse(text);
      list.forEach(obj => {
        const meta = new ExtensionMetadata(
          obj.metadata.galleryApiUrl,
          obj.metadata.id,
          obj.metadata.downloadUrl,
          obj.metadata.publisherId,
          obj.metadata.publisherDisplayName,
          obj.metadata.date
        );
        const item = new ExtensionInformation();
        item.metadata = meta;
        item.name = obj.name;
        item.publisher = obj.publisher;
        item.version = obj.version;
        item.disabled = obj.disabled || false;

        if (item.name !== "code-settings-sync") {
          extList.push(item);
        }
      });
    } catch (err) {
      throw new Error(err);
    }

    return extList;
  }

  public metadata: ExtensionMetadata;
  public name: string;
  public version: string;
  public publisher: string;
  /** Whether the extension is currently disabled by the user */
  public disabled: boolean = false;
}

export class ExtensionMetadata {
  constructor(
    public galleryApiUrl: string,
    public id: string,
    public downloadUrl: string,
    public publisherId: string,
    public publisherDisplayName: string,
    public date: string
  ) {}
}

export class PluginService {
  public static GetMissingExtensions(
    remoteExt: string,
    ignoredExtensions: string[]
  ) {
    const remoteList = ExtensionInformation.fromJSONList(remoteExt);
    const localList = this.CreateExtensionList();

    return remoteList.filter(
      ext =>
        !ignoredExtensions.includes(ext.name) &&
        !localList.map(e => e.name).includes(ext.name)
    );
  }

  public static GetDeletedExtensions(
    remoteExtensions: ExtensionInformation[],
    ignoredExtensions: string[]
  ) {
    const localExtensions = this.CreateExtensionList();

    return localExtensions.filter(
      ext =>
        ext.name !== "code-settings-sync" &&
        !remoteExtensions.map(e => e.name).includes(ext.name) &&
        !ignoredExtensions.includes(ext.name)
    );
  }

  /**
   * Scan the VS Code extensions directory on disk for ALL installed extensions,
   * including disabled ones that vscode.extensions.all does not return.
   * Extension folder names follow the pattern: publisher.name-version
   */
  public static ScanExtensionsFolder(): string[] {
    const extFolder = state.environment.EXTENSION_FOLDER;
    if (!extFolder || !fs.existsSync(extFolder)) {
      return [];
    }
    try {
      return fs.readdirSync(extFolder).filter(name => {
        // Filter out non-extension entries (dotfiles, .obsolete, etc.)
        if (name.startsWith(".")) return false;
        // Must contain a publisher and name separated by a dot
        if (!name.includes(".")) return false;
        const dirPath = path.join(extFolder, name);
        return fs.statSync(dirPath).isDirectory();
      });
    } catch {
      return [];
    }
  }

  /**
   * Parse an extension folder name (publisher.name-version) into components.
   * The version is separated from the name by a dash.
   * E.g. "shan.code-settings-sync-3.4.3" → publisher:"shan", name:"code-settings-sync", version:"3.4.3"
   */
  public static ParseExtensionFolderName(
    folderName: string
  ): { publisher: string; name: string; version: string } | null {
    const firstDot = folderName.indexOf(".");
    if (firstDot === -1) return null;

    const publisher = folderName.substring(0, firstDot);
    const rest = folderName.substring(firstDot + 1);

    // The version is the part after the last dash (e.g., code-settings-sync-3.4.3)
    const lastDash = rest.lastIndexOf("-");
    if (lastDash === -1) {
      // No dash at all — folder is just "publisher.name"
      return { publisher, name: rest, version: "" };
    }

    const candidateVersion = rest.substring(lastDash + 1);

    // Check if the candidate looks like a version (contains a digit).
    // Extensions like "vscode-eslint" have a dash in the name but no version suffix.
    if (!/[0-9]/.test(candidateVersion)) {
      // Not a version — treat the entire rest as the name
      return { publisher, name: rest, version: "" };
    }

    const name = rest.substring(0, lastDash);
    return { publisher, name, version: candidateVersion };
  }

  public static CreateExtensionList() {
    // Get enabled extensions via VS Code API
    const enabledExtensions = vscode.extensions.all
      .filter(ext => !ext.packageJSON.isBuiltin)
      .map(ext => {
        const meta = ext.packageJSON.__metadata || {
          id: ext.packageJSON.uuid,
          publisherId: ext.id,
          publisherDisplayName: ext.packageJSON.publisher
        };
        const data = new ExtensionMetadata(
          meta.galleryApiUrl,
          meta.id,
          meta.downloadUrl,
          meta.publisherId,
          meta.publisherDisplayName,
          meta.date
        );
        const info = new ExtensionInformation();
        info.metadata = data;
        info.name = ext.packageJSON.name;
        info.publisher = ext.packageJSON.publisher;
        info.version = ext.packageJSON.version;
        info.disabled = false;
        return info;
      });

    // Get disabled extensions by scanning the extensions directory on disk
    // and finding extensions NOT returned by vscode.extensions.all
    const enabledNames = new Set(
      enabledExtensions.map(e => `${e.publisher}.${e.name}`)
    );
    const folderNames = this.ScanExtensionsFolder();

    for (const folderName of folderNames) {
      const parsed = this.ParseExtensionFolderName(folderName);
      if (!parsed) continue;

      const extKey = `${parsed.publisher}.${parsed.name}`;
      // Skip if already in enabled list
      if (enabledNames.has(extKey)) continue;
      // Skip self
      if (parsed.name === "code-settings-sync") continue;

      // This extension is on disk but NOT in vscode.extensions.all → it's disabled
      const info = new ExtensionInformation();
      info.name = parsed.name;
      info.publisher = parsed.publisher;
      info.version = parsed.version;
      info.disabled = true;
      info.metadata = new ExtensionMetadata(
        "",            // galleryApiUrl
        "",            // id
        "",            // downloadUrl
        "",            // publisherId
        parsed.publisher, // publisherDisplayName
        ""             // date
      );
      enabledExtensions.push(info);
    }

    return enabledExtensions;
  }

  public static async DeleteExtension(
    extension: ExtensionInformation
  ): Promise<boolean> {
    try {
      await vscode.commands.executeCommand(
        "workbench.extensions.uninstallExtension",
        `${extension.publisher}.${extension.name}`
      );
      return true;
    } catch (err) {
      throw new Error(err);
    }
  }

  public static async DeleteExtensions(
    extensionsJson: string,
    ignoredExtensions: string[]
  ): Promise<ExtensionInformation[]> {
    const remoteExtensions = ExtensionInformation.fromJSONList(extensionsJson);
    const toDelete = PluginService.GetDeletedExtensions(
      remoteExtensions,
      ignoredExtensions
    );

    return Promise.all(
      toDelete.map(async selectedExtension => {
        try {
          await PluginService.DeleteExtension(selectedExtension);
          return selectedExtension;
        } catch (err) {
          throw new Error(
            `Sync : Unable to delete extension ${selectedExtension.name} ${selectedExtension.version}: ${err}`
          );
        }
      })
    );
  }

  public static async InstallExtensions(
    extensions: string,
    ignoredExtensions: string[],
    notificationCallBack: (...data: any[]) => void
  ): Promise<ExtensionInformation[]> {
    let addedExtensions: ExtensionInformation[] = [];
    const missingExtensions = PluginService.GetMissingExtensions(
      extensions,
      ignoredExtensions
    );
    if (missingExtensions.length === 0) {
      notificationCallBack("Sync : No Extensions needs to be installed.");
      return [];
    }
    addedExtensions = await PluginService.InstallWithAPI(
      missingExtensions,
      notificationCallBack
    );
    return addedExtensions;
  }

  public static async InstallWithAPI(
    missingExtensions: ExtensionInformation[],
    notificationCallBack: (...data: any[]) => void
  ): Promise<ExtensionInformation[]> {
    const addedExtensions: ExtensionInformation[] = [];
    const missingExtensionsCount = missingExtensions.length;
    notificationCallBack("TOTAL EXTENSIONS : " + missingExtensionsCount);
    notificationCallBack("");
    notificationCallBack("");
    for (const ext of missingExtensions) {
      const name = ext.publisher + "." + ext.name;
      try {
        notificationCallBack("");
        notificationCallBack(`[x] - EXTENSION: ${ext.name} - INSTALLING`);
        await vscode.commands.executeCommand(
          "workbench.extensions.installExtension",
          name
        );
        notificationCallBack("");
        notificationCallBack(`[x] - EXTENSION: ${ext.name} INSTALLED.`);
        notificationCallBack(
          `      ${missingExtensions.indexOf(ext) +
            1} OF ${missingExtensionsCount} INSTALLED`,
          true
        );
        notificationCallBack("");
        addedExtensions.push(ext);
      } catch (err) {
        throw new Error(err);
      }
    }
    return addedExtensions;
  }
}
