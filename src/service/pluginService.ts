"use strict";

import * as fs from "fs-extra";
import * as path from "path";
import * as vscode from "vscode";
import * as util from "../util";

const apiPath =
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";

const extensionDir = ".vscode";

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
  public static GetMissingExtensions(remoteExt: string) {
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
      if (hashset[ext.name] == null) {
        missingList.push(ext);
      }
    }
    return missingList;
  }

  public static GetDeletedExtensions(remoteList: ExtensionInformation[]) {
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
          if (ext.name === localExt.name) {
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
      if (
        ext.extensionPath.includes(extensionDir) && // skip if not install from gallery
        ext.packageJSON.isBuiltin === false
      ) {
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
    extensionFolder: string
  ): Promise<ExtensionInformation[]> {
    const remoteList = ExtensionInformation.fromJSONList(extensionsJson);
    const deletedList = PluginService.GetDeletedExtensions(remoteList);
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
    extFolder: string,
    notificationCallBack: (...data: any[]) => void
  ): Promise<ExtensionInformation[]> {
    const actionList: Array<Promise<void>> = [];
    const addedExtensions: ExtensionInformation[] = [];
    const missingList = PluginService.GetMissingExtensions(extensions);
    if (missingList.length === 0) {
      notificationCallBack("Sync : No Extensions needs to be installed.");
      return [];
    }

    let totalInstalled: number = 0;

    for (const element of missingList) {
      actionList.push(
        PluginService.InstallExtension(element, extFolder).then(
          () => {
            totalInstalled = totalInstalled + 1;
            notificationCallBack(
              "Sync : Extension " +
                totalInstalled +
                " of " +
                missingList.length.toString() +
                " installed.",
              false
            );
            addedExtensions.push(element);
          },
          (err: any) => {
            console.error(err);
            notificationCallBack(
              "Sync : " + element.name + " Download Failed.",
              true
            );
          }
        )
      );
    }

    try {
      await Promise.all(actionList);
      return addedExtensions;
    } catch (err) {
      // always return extension list
      return addedExtensions;
    }
  }

  public static async InstallExtension(
    item: ExtensionInformation,
    ExtensionFolder: string
  ) {
    const header = {
      Accept: "application/json;api-version=3.0-preview.1"
    };
    let extractPath: string = null;

    const data = {
      filters: [
        {
          criteria: [
            {
              filterType: 4,
              value: item.metadata.id
            }
          ]
        }
      ],
      flags: 133
    };

    try {
      const res = await util.Util.HttpPostJson(apiPath, data, header);
      let downloadUrl: string;

      try {
        let targetVersion = null;
        const content = JSON.parse(res);

        // Find correct version
        for (const result of content.results) {
          for (const extension of result.extensions) {
            for (const version of extension.versions) {
              if (version.version === item.version) {
                targetVersion = version;
                break;
              }
            }
            if (targetVersion !== null) {
              break;
            }
          }
          if (targetVersion !== null) {
            break;
          }
        }

        if (
          targetVersion === null ||
          !targetVersion ||
          !targetVersion.assetUri
        ) {
          // unable to find one
          throw new Error("NA");
        }

        // Proceed to install
        downloadUrl =
          targetVersion.assetUri +
          "/Microsoft.VisualStudio.Services.VSIXPackage?install=true";
        console.log("Installing from Url :" + downloadUrl);
      } catch (error) {
        if (error === "NA" || error.message === "NA") {
          console.error(
            "Sync : Extension : '" +
              item.name +
              "' - Version : '" +
              item.version +
              "' Not Found in marketplace. Remove the extension and upload the settings to fix this."
          );
        }
        console.error(error);
        throw error;
      }

      const filePath = await util.Util.HttpGetFile(downloadUrl);

      const dir = await util.Util.Extract(filePath);

      extractPath = dir;
      const packageJson = await PluginService.GetPackageJson(dir, item);

      Object.assign(packageJson, {
        __metadata: item.metadata
      });

      const text = JSON.stringify(packageJson, null, " ");
      await PluginService.WritePackageJson(extractPath, text);

      // Move the folder to correct path
      const destination = path.join(
        ExtensionFolder,
        item.publisher + "." + item.name + "-" + item.version
      );
      const source = path.join(extractPath, "extension");
      await PluginService.CopyExtension(destination, source);
    } catch (err) {
      console.error(
        `Sync : Extension : '${item.name}' - Version : '${item.version}'` + err
      );
      throw err;
    }
  }

  private static async CopyExtension(
    destination: string,
    source: string
  ): Promise<void> {
    await fs.copy(source, destination, { overwrite: true });
  }
  private static async WritePackageJson(dirName: string, packageJson: string) {
    await fs.writeFile(
      dirName + "/extension/package.json",
      packageJson,
      "utf-8"
    );
  }
  private static async GetPackageJson(
    dirName: string,
    item: ExtensionInformation
  ) {
    const text = await fs.readFile(
      dirName + "/extension/package.json",
      "utf-8"
    );

    const config = JSON.parse(text);

    if (config.name !== item.name) {
      throw new Error("name not equal");
    }
    if (config.publisher !== item.publisher) {
      throw new Error("publisher not equal");
    }
    if (config.version !== item.version) {
      throw new Error("version not equal");
    }

    return config;
  }
}
