"use strict";
import { exec } from "child_process";
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

    localList.forEach(ext => {
      if (hashset[ext.name] == null) {
        hashset[ext.name] = ext;
      }
    });

    remoteList.forEach(ext => {
      if (
        hashset[ext.name] == null &&
        ignoredExtensions.includes(ext.name) === false
      ) {
        missingList.push(ext);
      }
    });
    return missingList;
  }

  public static GetDeletedExtensions(
    remoteExtensions: ExtensionInformation[],
    ignoredExtensions: string[]
  ) {
    const localExtensions = this.CreateExtensionList();
    const toDelete: ExtensionInformation[] = [];

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

    localExtensions.forEach(ext => {
      if (ext.name !== "code-settings-sync") {
        if (
          !remoteExtensions.map(e => e.name).includes(ext.name) &&
          !ignoredExtensions.includes(ext.name)
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
    cliPath: string
  ): Promise<boolean> {
    const extensionCli = `${cliPath} --uninstall-extension ${
      extension.publisher
    }.${extension.name}`;
    return new Promise<boolean>(res => {
      exec(extensionCli, (err, stdout, stderr) => {
        if (!stdout && (err || stderr)) {
          console.log("Sync : " + "Error in uninstalling Extension.");
          console.log(err);
          res(false);
        }
        res(true);
      });
    });
  }

  public static async DeleteExtensions(
    extensionsJson: string,
    cliPath: string,
    ignoredExtensions: string[]
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

    toDelete.forEach(async selectedExtension => {
      try {
        await PluginService.DeleteExtension(selectedExtension, cliPath);
        deletedExtensions.push(selectedExtension);
      } catch (err) {
        console.error(
          "Sync : Unable to delete extension " +
            selectedExtension.name +
            " " +
            selectedExtension.version
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
    cliPath: string,
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
    addedExtensions = await PluginService.InstallWithCLI(
      missingExtensions,
      cliPath,
      notificationCallBack
    );
    return addedExtensions;
  }

  public static async InstallWithCLI(
    missingExtensions: ExtensionInformation[],
    cliPath: string,
    notificationCallBack: (...data: any[]) => void
  ): Promise<ExtensionInformation[]> {
    const addedExtensions: ExtensionInformation[] = [];

    notificationCallBack("TOTAL EXTENSIONS : " + missingExtensions.length);
    notificationCallBack("");
    notificationCallBack("");
    for (let i = 0; i < missingExtensions.length; i++) {
      const missExt = missingExtensions[i];
      const name = missExt.publisher + "." + missExt.name;
      const extensionCli = cliPath + " --install-extension " + name;
      notificationCallBack(extensionCli);
      try {
        const installed = await new Promise<boolean>(res => {
          exec(extensionCli, (err, stdout, stderr) => {
            if (!stdout && (err || stderr)) {
              notificationCallBack(err || stderr);
              res(false);
            }
            notificationCallBack(stdout);
            res(true);
          });
        });
        if (installed) {
          notificationCallBack("");
          notificationCallBack(
            "EXTENSION : " +
              (i + 1) +
              " / " +
              missingExtensions.length.toString() +
              " INSTALLED.",
            true
          );
          notificationCallBack("");
          notificationCallBack("");
          addedExtensions.push(missExt);
        }
      } catch (err) {
        console.log(err);
      }
    }

    return addedExtensions;
  }
}
