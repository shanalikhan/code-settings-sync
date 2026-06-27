"use strict";

import * as fs from "fs-extra";
import * as path from "path";

export interface IInstalledExtensionMetadata {
  galleryApiUrl: string;
  id: string;
  downloadUrl: string;
  publisherId: string;
  publisherDisplayName: string;
  date: string;
}

export interface IInstalledExtensionInformation {
  metadata: IInstalledExtensionMetadata;
  name: string;
  version: string;
  publisher: string;
}

export class InstalledExtensionsService {
  public static CreateExtensionFromPackageJSON(
    packageJSON: any,
    fallbackMetadata: Partial<IInstalledExtensionMetadata> = {}
  ): IInstalledExtensionInformation {
    const meta = Object.assign(
      {
        id: packageJSON.uuid,
        publisherId: packageJSON.publisher,
        publisherDisplayName: packageJSON.publisher
      },
      fallbackMetadata,
      packageJSON.__metadata || {}
    );

    return {
      metadata: {
        galleryApiUrl: meta.galleryApiUrl,
        id: meta.id,
        downloadUrl: meta.downloadUrl,
        publisherId: meta.publisherId,
        publisherDisplayName: meta.publisherDisplayName,
        date: meta.date
      },
      name: packageJSON.name,
      publisher: packageJSON.publisher,
      version: packageJSON.version
    };
  }

  public static MergeFromExtensionFolder(
    extensions: IInstalledExtensionInformation[],
    extensionFolder: string
  ): IInstalledExtensionInformation[] {
    if (!extensionFolder || !fs.existsSync(extensionFolder)) {
      return extensions;
    }

    const existingExtensions = extensions.map(ext =>
      InstalledExtensionsService.GetExtensionFullName(ext)
    );

    fs.readdirSync(extensionFolder).forEach(folderName => {
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
          packageJSON.isBuiltin ||
          !packageJSON.name ||
          !packageJSON.publisher
        ) {
          return;
        }

        const extension = InstalledExtensionsService.CreateExtensionFromPackageJSON(
          packageJSON
        );
        const extensionName = InstalledExtensionsService.GetExtensionFullName(
          extension
        );
        if (!existingExtensions.includes(extensionName)) {
          extensions.push(extension);
          existingExtensions.push(extensionName);
        }
      } catch (err) {
        console.warn(
          `Sync : Unable to read extension ${folderName}: ${String(err)}`
        );
      }
    });

    return extensions;
  }

  public static GetExtensionFullName(
    extension: IInstalledExtensionInformation
  ): string {
    return `${extension.publisher}.${extension.name}`.toLowerCase();
  }
}
