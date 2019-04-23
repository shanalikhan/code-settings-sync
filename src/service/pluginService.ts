"use strict";
import { remove } from "fs-extra";
import { join } from "path";
import * as vscode from "vscode";

export class ExtensionInformation {
  public static fromJSON(text: string) {
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
    return item;
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

        if (item.name !== "code-settings-sync") {
          extList.push(item);
        }
      });
    } catch (err) {
      console.error("Sync : Unable to Parse extensions list", err);
    }

    return extList;
  }

  public metadata: ExtensionMetadata;
  public name: string;
  public version: string;
  public publisher: string;
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
    const hashset = {};
    const remoteList = ExtensionInformation.fromJSONList(remoteExt);
    const localList = this.CreateExtensionList();
    const missingList: ExtensionInformation[] = [];

    for (const ext of localList) {
      if (hashset[ext.name] == null) {
        hashset[ext.name] = ext;
      }
    }

    for (const ext of remoteList) {
      if (
        hashset[ext.name] == null &&
        ignoredExtensions.includes(ext.name) === false
      ) {
        missingList.push(ext);
      }
    }
    return missingList;
  }

  public static GetDeletedExtensions(
    remoteExtensions: ExtensionInformation[],
    ignoredExtensions: string[]
  ) {
    const localExtensions = this.CreateExtensionList();
    const toDelete: ExtensionInformation[] = [];

    localExtensions.forEach(ext => {
      if (ext.name !== "code-settings-sync") {
        if (
          !remoteExtensions.includes(ext) ||
          ignoredExtensions.includes(ext.name)
        ) {
          toDelete.push(ext);
        }
      }
    });
    return toDelete;
  }

  public static CreateExtensionList() {
    const list: ExtensionInformation[] = [];

    vscode.extensions.all.forEach(ext => {
      if (ext.packageJSON.isBuiltin === true) {
        return;
      }

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
      list.push(info);
    });

    return list;
  }

  public static async DeleteExtension(
    extension: ExtensionInformation,
    extensionFolder: string
  ): Promise<boolean> {
    const destination = join(
      extensionFolder,
      extension.publisher + "." + extension.name + "-" + extension.version
    );
    try {
      await remove(destination);
      return true;
    } catch (err) {
      console.log("Sync : " + "Error in uninstalling Extension.");
      console.log(err);
      throw err;
    }
  }

  public static async DeleteExtensions(
    extensionsJson: string,
    ignoredExtensions: string[],
    extensionFolder: string
  ): Promise<ExtensionInformation[]> {
    const remoteExtensions = ExtensionInformation.fromJSONList(extensionsJson);
    const toDelete = PluginService.GetDeletedExtensions(
      remoteExtensions,
      ignoredExtensions
    );
    const deletedExtensions: ExtensionInformation[] = [];

    if (toDelete.length === 0) {
      return deletedExtensions;
    }
    toDelete.forEach(async ext => {
      try {
        await PluginService.DeleteExtension(ext, extensionFolder);
        deletedExtensions.push(ext);
      } catch (err) {
        console.error(
          `Sync : Unable to delete extension ${ext.name} ${ext.version}`
        );
        console.error(err);
        throw deletedExtensions;
      }
    });
    return deletedExtensions;
  }

  public static async InstallExtensions(
    extensions: string,
    ignoredExtensions: string[],
    notificationCallBack: (...data: any[]) => void
  ): Promise<ExtensionInformation[]> {
    let addedExtensions: ExtensionInformation[] = [];
    const missingList = PluginService.GetMissingExtensions(
      extensions,
      ignoredExtensions
    );
    if (missingList.length === 0) {
      notificationCallBack("Sync : No Extensions needs to be installed.");
      return [];
    }
    addedExtensions = await PluginService.HandleInstallation(
      missingList,
      notificationCallBack
    );
    return addedExtensions;
  }

  public static async HandleInstallation(
    missingExtensions: ExtensionInformation[],
    notificationCallBack: (...data: any[]) => void
  ): Promise<ExtensionInformation[]> {
    const addedExtensions: ExtensionInformation[] = [];
    notificationCallBack("TOTAL EXTENSIONS : " + missingExtensions.length);
    notificationCallBack("");
    notificationCallBack("");
    missingExtensions.forEach(ext => {
      const name = ext.publisher + "." + ext.name;
      try {
        notificationCallBack(`INSTALLING EXTENSION: ${name}`);
        vscode.commands.executeCommand(
          "workbench.extensions.installExtension",
          name
        );
        notificationCallBack("");
        notificationCallBack(
          "EXTENSION : " +
            (missingExtensions.indexOf(ext) + 1) +
            " / " +
            missingExtensions.length.toString() +
            " INSTALLED.",
          true
        );
        notificationCallBack("");
        notificationCallBack("");
        addedExtensions.push(ext);
      } catch (err) {
        console.log(err);
      }
    });

    return addedExtensions;
  }
}
