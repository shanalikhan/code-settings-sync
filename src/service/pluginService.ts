"use strict";
import * as fs from "fs-extra";
import * as path from "path";
import * as vscode from "vscode";

import { OsType } from "../enums";

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
    remoteList: ExtensionInformation[],
    ignoredExtensions: string[]
  ) {
    const localList = this.CreateExtensionList();
    const deletedList: ExtensionInformation[] = [];

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

    for (const ext of localList) {
      let found: boolean = false;
      if (ext.name !== "code-settings-sync") {
        for (const localExt of remoteList) {
          if (
            ext.name === localExt.name ||
            ignoredExtensions.includes(ext.name)
          ) {
            found = true;
            break;
          }
        }
        if (!found) {
          deletedList.push(ext);
        }
      }
    }
    return deletedList;
  }

  public static CreateExtensionList() {
    const list: ExtensionInformation[] = [];

    for (const ext of vscode.extensions.all) {
      if (ext.packageJSON.isBuiltin === true) {
        continue;
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
    }

    return list;
  }

  public static async DeleteExtension(
    item: ExtensionInformation,
    ExtensionFolder: string
  ): Promise<boolean> {
    const destination = path.join(
      ExtensionFolder,
      item.publisher + "." + item.name + "-" + item.version
    );

    try {
      await fs.remove(destination);
      return true;
    } catch (err) {
      console.log("Sync : " + "Error in uninstalling Extension.");
      console.log(err);
      throw err;
    }
  }

  public static async DeleteExtensions(
    extensionsJson: string,
    extensionFolder: string,
    ignoredExtensions: string[]
  ): Promise<ExtensionInformation[]> {
    const remoteList = ExtensionInformation.fromJSONList(extensionsJson);
    const deletedList = PluginService.GetDeletedExtensions(
      remoteList,
      ignoredExtensions
    );
    const deletedExt: ExtensionInformation[] = [];

    if (deletedList.length === 0) {
      return deletedExt;
    }
    for (const selectedExtension of deletedList) {
      try {
        await PluginService.DeleteExtension(selectedExtension, extensionFolder);
        deletedExt.push(selectedExtension);
      } catch (err) {
        console.error(
          "Sync : Unable to delete extension " +
            selectedExtension.name +
            " " +
            selectedExtension.version
        );
        console.error(err);
        throw deletedExt;
      }
    }
    return deletedExt;
  }

  public static async InstallExtensions(
    extensions: string,
    ignoredExtensions: string[],
    osType: OsType,
    insiders: boolean,
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
    addedExtensions = await PluginService.ProcessInstallationCLI(
      missingList,
      osType,
      insiders,
      notificationCallBack
    );
    return addedExtensions;
  }

  public static async ProcessInstallationCLI(
    missingList: ExtensionInformation[],
    osType: OsType,
    isInsiders: boolean,
    notificationCallBack: (...data: any[]) => void
  ): Promise<ExtensionInformation[]> {
    const addedExtensions: ExtensionInformation[] = [];
    const exec = require("child_process").exec;
    notificationCallBack("TOTAL EXTENSIONS : " + missingList.length);
    notificationCallBack("");
    notificationCallBack("");
    let myExt: string = process.argv0;
    console.log(myExt);
    let codeLastFolder = "";
    let codeCliPath = "";
    if (osType === OsType.Windows) {
      if (isInsiders) {
        codeLastFolder = "Code - Insiders";
        codeCliPath = "bin/code-insiders";
      } else {
        codeLastFolder = "Code";
        codeCliPath = "bin/code";
      }
    } else if (osType === OsType.Linux) {
      if (isInsiders) {
        codeLastFolder = "code-insiders";
        codeCliPath = "bin/code-insiders";
      } else {
        codeLastFolder = "code";
        codeCliPath = "bin/code";
      }
    } else if (osType === OsType.Mac) {
      codeLastFolder = "Frameworks";
      codeCliPath = "Resources/app/bin/code";
    }
    myExt =
      '"' +
      myExt.substr(0, myExt.lastIndexOf(codeLastFolder)) +
      codeCliPath +
      '"';
    for (let i = 0; i < missingList.length; i++) {
      const missExt = missingList[i];
      const name = missExt.publisher + "." + missExt.name;
      const extensionCli = myExt + " --install-extension " + name;
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
              missingList.length.toString() +
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
