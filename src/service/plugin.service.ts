"use strict";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

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
      item.disabled = !!obj.disabled;
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
        item.disabled = !!obj.disabled;

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
  public disabled: boolean = false;

  public get extensionId(): string {
    return `${this.publisher}.${this.name}`;
  }
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
  public static GetEnabledExtensionIds(): string[] {
    return vscode.extensions.all
      .filter(ext => !ext.packageJSON.isBuiltin)
      .map(ext => ext.id);
  }

  public static GetCodeCliCandidates(): string[] {
    const candidates: string[] = [];
    try {
      const codeCliName = process.platform === "win32" ? "code.cmd" : "code";
      // vscode.env.appRoot is usually ".../resources/app"
      const bundledCli = path.join(vscode.env.appRoot, "bin", codeCliName);
      candidates.push(bundledCli);
    } catch (err) {
      // ignore
    }

    candidates.push("code");
    candidates.push("code-insiders");
    return candidates;
  }

  public static TryGetInstalledExtensionIds(): string[] {
    for (const candidate of PluginService.GetCodeCliCandidates()) {
      try {
        if (candidate.includes(path.sep) && !fs.existsSync(candidate)) {
          continue;
        }

        const stdout = execFileSync(candidate, ["--list-extensions"], {
          encoding: "utf8",
          windowsHide: true,
          timeout: 15000
        });

        return stdout
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);
      } catch (err) {
        // try next candidate
      }
    }

    return [];
  }

  public static GetDisabledExtensionIds(): string[] {
    const installed = PluginService.TryGetInstalledExtensionIds();
    if (installed.length === 0) {
      return [];
    }

    const enabled = new Set(PluginService.GetEnabledExtensionIds());
    return installed.filter(id => !enabled.has(id));
  }

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

    // for (var i = 0; i < remoteList.length; i++) {

    //     var ext = remoteList[i];
    //     var found: boolean = false;

    //     for (var j = 0; j < localList.length; j++) {
    //         var localExt = localList[j];
    //         if (ext.name == localExt.name) {
    //             found = true;
    //             break;
    //         }
    //     }
    //     if (!found) {
    //         deletedList.push(localExt);
    //     }

    // }

    return localExtensions.filter(
      ext =>
        ext.name !== "code-settings-sync" &&
        !remoteExtensions.map(e => e.name).includes(ext.name) &&
        !ignoredExtensions.includes(ext.name)
    );
  }

  public static CreateExtensionList() {
    const disabled = new Set(PluginService.GetDisabledExtensionIds());
    return vscode.extensions.all
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
        info.disabled = disabled.has(ext.id);
        return info;
      });
  }

  public static async ApplyExtensionEnablement(
    extensionsJson: string,
    ignoredExtensions: string[],
    notificationCallBack: (...data: any[]) => void
  ): Promise<void> {
    const remoteExtensions = ExtensionInformation.fromJSONList(extensionsJson);
    const ignored = new Set(ignoredExtensions || []);

    for (const ext of remoteExtensions) {
      if (ext.name === "code-settings-sync") {
        continue;
      }
      if (ignored.has(ext.name)) {
        continue;
      }

      try {
        if (ext.disabled) {
          notificationCallBack(
            `[ ] - EXTENSION: ${ext.extensionId} - DISABLING`,
            false
          );
          await vscode.commands.executeCommand(
            "workbench.extensions.action.disableExtension",
            ext.extensionId
          );
        } else {
          notificationCallBack(
            `[ ] - EXTENSION: ${ext.extensionId} - ENABLING`,
            false
          );
          await vscode.commands.executeCommand(
            "workbench.extensions.action.enableExtension",
            ext.extensionId
          );
        }
      } catch (err) {
        // Best-effort: do not fail full sync if enablement canÃ¢â‚¬â„¢t be applied.
      }
    }
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
