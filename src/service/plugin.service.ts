"use strict";
import * as vscode from "vscode";
import { state } from "../state";
import { listDiskExtensionEntries } from "./extensionInventory.service";

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
  // True when the extension was installed but disabled at upload time.
  // Absent (old cloud payloads) means enabled; never serialized as such.
  public disabled?: boolean = false;
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
        // API-visible extensions are enabled; disabled ones are absent
        // from the API and merged in by CreateExtensionListWithDisabled.
        info.disabled = false;
        return info;
      });
  }

  // Upload inventory including disabled extensions (issue #143).
  // Anything installed on disk but invisible to the API is recorded with
  // disabled=true so download can re-apply the state. Falls back to the
  // plain API list when the folder is unavailable.
  public static CreateExtensionListWithDisabled(extensionFolder?: string) {
    const apiList = PluginService.CreateExtensionList();
    try {
      const folder =
        extensionFolder ||
        (state.environment && state.environment.EXTENSION_FOLDER) ||
        "";
      const diskEntries = listDiskExtensionEntries(folder);
      const known = apiList.map(ext =>
        `${ext.publisher}.${ext.name}`.toLowerCase()
      );
      for (const entry of diskEntries) {
        const full = `${entry.publisher}.${entry.name}`;
        if (known.includes(full.toLowerCase())) {
          continue;
        }
        const info = new ExtensionInformation();
        info.metadata = new ExtensionMetadata(
          "",
          "",
          "",
          entry.publisher,
          entry.publisher,
          ""
        );
        info.name = entry.name;
        info.publisher = entry.publisher;
        info.version = entry.version;
        info.disabled = true;
        apiList.push(info);
        known.push(full.toLowerCase());
      }
    } catch (err) {
      // Disk scan is best-effort; the API list alone still syncs.
    }
    return apiList;
  }

  // Re-applies the disabled state after download (issue #143).
  // Fail-soft per extension: old clients without the disable command
  // report `skipped` instead of failing the whole download.
  public static async DisableExtensions(
    extensions: ExtensionInformation[],
    notificationCallBack: (...data: any[]) => void = () => undefined
  ): Promise<{ disabled: string[]; skipped: string[] }> {
    const result: { disabled: string[]; skipped: string[] } = {
      disabled: [],
      skipped: []
    };
    for (const ext of extensions) {
      if (!ext.disabled) {
        continue;
      }
      const full = `${ext.publisher}.${ext.name}`;
      try {
        await vscode.commands.executeCommand(
          "workbench.extensions.disableExtension",
          full
        );
        notificationCallBack(`Sync : Disabled extension ${full}.`);
        result.disabled.push(full);
      } catch (err) {
        notificationCallBack(
          `Sync : Unable to disable extension ${full} on this client: ${err}`
        );
        result.skipped.push(full);
      }
    }
    return result;
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
