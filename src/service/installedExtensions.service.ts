"use strict";

import * as fs from "fs-extra";
import * as path from "path";
import {
  ExtensionInformation,
  ExtensionMetadata
} from "../models/extensionInformation.model";

export interface IInstalledExtensionMetadata {
  galleryApiUrl?: string;
  id?: string;
  downloadUrl?: string;
  publisherId?: string;
  publisherDisplayName?: string;
  date?: string;
}

export interface IInstalledExtensionInformation {
  metadata: IInstalledExtensionMetadata;
  name: string;
  version: string;
  publisher: string;
  disabled?: boolean;
}

export class InstalledExtensionsService {
  public static GetExtensionFullName(
    extension: ExtensionInformation | IInstalledExtensionInformation
  ): string {
    return `${extension.publisher}.${extension.name}`.toLowerCase();
  }

  public static CreateExtensionFromPackageJSON(
    packageJSON: any,
    disabled: boolean = false
  ): ExtensionInformation {
    const meta = packageJSON.__metadata || {
      id: packageJSON.uuid,
      publisherId: packageJSON.publisher,
      publisherDisplayName: packageJSON.publisher
    };

    const data = new ExtensionMetadata(
      meta.galleryApiUrl || "",
      meta.id || "",
      meta.downloadUrl || "",
      meta.publisherId || packageJSON.publisher || "",
      meta.publisherDisplayName || packageJSON.publisher || "",
      meta.date || ""
    );

    const info = new ExtensionInformation();
    info.metadata = data;
    info.name = packageJSON.name;
    info.publisher = packageJSON.publisher;
    info.version = packageJSON.version;
    info.disabled = disabled;
    return info;
  }

  public static GetInstalledExtensionsFromFolder(
    extensionFolder: string
  ): ExtensionInformation[] {
    const installedExtensions: ExtensionInformation[] = [];
    if (!extensionFolder || !fs.existsSync(extensionFolder)) {
      return installedExtensions;
    }

    const addedFullNames: string[] = [];

    // 1. Check for extensions.json in the extensions directory
    const extensionsJsonPath = path.join(extensionFolder, "extensions.json");
    if (fs.existsSync(extensionsJsonPath)) {
      try {
        const list = fs.readJSONSync(extensionsJsonPath);
        if (Array.isArray(list)) {
          list.forEach(item => {
            if (!item || !item.identifier || !item.identifier.id) {
              return;
            }
            const parts = item.identifier.id.split(".");
            if (parts.length < 2) {
              return;
            }
            const publisher = parts[0];
            const name = parts.slice(1).join(".");
            const meta = item.metadata || {};
            if (meta.isBuiltin) {
              return;
            }

            const data = new ExtensionMetadata(
              meta.galleryApiUrl || "",
              meta.id || item.identifier.uuid || "",
              meta.downloadUrl || "",
              meta.publisherId || publisher,
              meta.publisherDisplayName ||
                meta.publisherDisplayName ||
                publisher,
              meta.date || ""
            );

            const info = new ExtensionInformation();
            info.metadata = data;
            info.name = name;
            info.publisher = publisher;
            info.version = item.version || "";
            info.disabled = false;

            const fullName = this.GetExtensionFullName(info);
            if (!addedFullNames.includes(fullName)) {
              installedExtensions.push(info);
              addedFullNames.push(fullName);
            }
          });
        }
      } catch (err) {
        console.warn(`Sync : Unable to read extensions.json: ${err}`);
      }
    }

    // 2. Scan folders in extensionFolder for package.json
    let obsoleteMap: { [key: string]: boolean } = {};
    const obsoletePath = path.join(extensionFolder, ".obsolete");
    if (fs.existsSync(obsoletePath)) {
      try {
        obsoleteMap = fs.readJSONSync(obsoletePath) || {};
      } catch (err) {
        // ignore error
      }
    }

    try {
      const folderEntries = fs.readdirSync(extensionFolder);
      folderEntries.forEach(folderName => {
        if (obsoleteMap[folderName]) {
          return;
        }

        const packageFile = path.join(
          extensionFolder,
          folderName,
          "package.json"
        );
        if (!fs.existsSync(packageFile)) {
          return;
        }

        try {
          const packageJSON = fs.readJSONSync(packageFile);
          if (
            !packageJSON ||
            packageJSON.isBuiltin ||
            !packageJSON.name ||
            !packageJSON.publisher
          ) {
            return;
          }

          const info = this.CreateExtensionFromPackageJSON(packageJSON, false);
          const fullName = this.GetExtensionFullName(info);
          if (!addedFullNames.includes(fullName)) {
            installedExtensions.push(info);
            addedFullNames.push(fullName);
          }
        } catch (err) {
          console.warn(
            `Sync : Unable to read extension package.json in ${folderName}: ${err}`
          );
        }
      });
    } catch (err) {
      console.warn(
        `Sync : Unable to scan extension directory ${extensionFolder}: ${err}`
      );
    }

    return installedExtensions;
  }

  public static MergeFromExtensionFolder(
    apiExtensions: ExtensionInformation[],
    extensionFolder: string
  ): ExtensionInformation[] {
    const existingFullNames = apiExtensions.map(ext =>
      this.GetExtensionFullName(ext)
    );

    const diskExtensions = this.GetInstalledExtensionsFromFolder(
      extensionFolder
    );

    diskExtensions.forEach(diskExt => {
      const fullName = this.GetExtensionFullName(diskExt);
      if (!existingFullNames.includes(fullName)) {
        diskExt.disabled = true;
        apiExtensions.push(diskExt);
        existingFullNames.push(fullName);
      }
    });

    return apiExtensions;
  }
}
