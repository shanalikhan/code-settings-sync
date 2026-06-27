import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import {
  IInstalledExtensionInformation,
  InstalledExtensionsService
} from "../../../src/service/installedExtensions.service";

describe("PluginService", () => {
  describe("CreateExtensionFromPackageJSON", () => {
    it("should preserve the VS Code extension id as publisherId fallback when metadata is missing", () => {
      const extension = InstalledExtensionsService.CreateExtensionFromPackageJSON(
        {
          uuid: "enabled-uuid",
          name: "enabled",
          publisher: "sample",
          version: "1.0.0"
        },
        {
          publisherId: "sample.enabled"
        }
      );

      expect(extension.metadata.id).to.eq("enabled-uuid");
      expect(extension.metadata.publisherId).to.eq("sample.enabled");
      expect(extension.metadata.publisherDisplayName).to.eq("sample");
    });
  });

  describe("MergeInstalledExtensionsFromDisk", () => {
    let extensionFolder: string;

    beforeEach(() => {
      extensionFolder = fs.mkdtempSync(
        path.join(os.tmpdir(), "settings-sync-extensions-")
      );
    });

    afterEach(() => {
      fs.removeSync(extensionFolder);
    });

    it("should include installed extensions that are not returned by the VS Code API", () => {
      const enabledExtension: IInstalledExtensionInformation = {
        metadata: {
          date: undefined,
          downloadUrl: undefined,
          galleryApiUrl: undefined,
          id: "enabled-id",
          publisherDisplayName: "Sample",
          publisherId: "sample"
        },
        name: "enabled",
        publisher: "sample",
        version: "1.0.0"
      };

      fs.mkdirpSync(path.join(extensionFolder, "sample.disabled-2.0.0"));
      fs.writeJSONSync(
        path.join(extensionFolder, "sample.disabled-2.0.0", "package.json"),
        {
          __metadata: {
            id: "disabled-id",
            publisherDisplayName: "Sample",
            publisherId: "sample"
          },
          name: "disabled",
          publisher: "sample",
          version: "2.0.0"
        }
      );

      const extensions = InstalledExtensionsService.MergeFromExtensionFolder(
        [enabledExtension],
        extensionFolder
      );

      expect(extensions.map(ext => `${ext.publisher}.${ext.name}`)).to.deep.eq([
        "sample.enabled",
        "sample.disabled"
      ]);
      expect(extensions[1].version).to.eq("2.0.0");
    });

    it("should not duplicate extensions that are already returned by the VS Code API", () => {
      const extension: IInstalledExtensionInformation = {
        metadata: {
          date: undefined,
          downloadUrl: undefined,
          galleryApiUrl: undefined,
          id: "enabled-id",
          publisherDisplayName: "Sample",
          publisherId: "sample"
        },
        name: "enabled",
        publisher: "sample",
        version: "1.0.0"
      };

      fs.mkdirpSync(path.join(extensionFolder, "sample.enabled-1.0.0"));
      fs.writeJSONSync(
        path.join(extensionFolder, "sample.enabled-1.0.0", "package.json"),
        {
          name: "enabled",
          publisher: "sample",
          version: "1.0.0"
        }
      );

      const extensions = InstalledExtensionsService.MergeFromExtensionFolder(
        [extension],
        extensionFolder
      );

      expect(extensions).to.have.length(1);
      expect(extensions[0].name).to.eq("enabled");
    });
  });
});
