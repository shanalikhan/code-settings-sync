import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { InstalledExtensionsService } from "../../src/service/installedExtensions.service";
import {
  ExtensionInformation,
  ExtensionMetadata
} from "../../src/models/extensionInformation.model";

describe("InstalledExtensionsService", () => {
  let tempFolder: string;

  beforeEach(() => {
    tempFolder = fs.mkdtempSync(
      path.join(os.tmpdir(), "settings-sync-extensions-test-")
    );
  });

  afterEach(() => {
    fs.removeSync(tempFolder);
  });

  describe("CreateExtensionFromPackageJSON", () => {
    it("should correctly parse extension with __metadata", () => {
      const packageJSON = {
        name: "test-ext",
        publisher: "test-pub",
        version: "1.2.3",
        __metadata: {
          id: "test-uuid",
          publisherId: "test-pub-id",
          publisherDisplayName: "Test Publisher",
          galleryApiUrl: "https://marketplace.visualstudio.com",
          downloadUrl: "https://marketplace.visualstudio.com/download",
          date: "2026-01-01"
        }
      };

      const ext = InstalledExtensionsService.CreateExtensionFromPackageJSON(
        packageJSON,
        true
      );

      expect(ext.name).to.eq("test-ext");
      expect(ext.publisher).to.eq("test-pub");
      expect(ext.version).to.eq("1.2.3");
      expect(ext.disabled).to.be.true;
      expect(ext.metadata.id).to.eq("test-uuid");
      expect(ext.metadata.publisherDisplayName).to.eq("Test Publisher");
    });

    it("should correctly parse extension without __metadata (fallback)", () => {
      const packageJSON = {
        name: "fallback-ext",
        publisher: "fallback-pub",
        version: "0.1.0",
        uuid: "fallback-uuid"
      };

      const ext = InstalledExtensionsService.CreateExtensionFromPackageJSON(
        packageJSON,
        false
      );

      expect(ext.name).to.eq("fallback-ext");
      expect(ext.publisher).to.eq("fallback-pub");
      expect(ext.version).to.eq("0.1.0");
      expect(ext.disabled).to.be.false;
      expect(ext.metadata.id).to.eq("fallback-uuid");
    });
  });

  describe("GetInstalledExtensionsFromFolder", () => {
    it("should return empty array for non-existent folder", () => {
      const result = InstalledExtensionsService.GetInstalledExtensionsFromFolder(
        "/non/existent/path"
      );
      expect(result).to.deep.eq([]);
    });

    it("should read extensions from extensions.json cache file", () => {
      const extensionsJson = [
        {
          identifier: {
            id: "publisher.cached-ext",
            uuid: "cached-uuid"
          },
          version: "1.0.0",
          metadata: {
            publisherDisplayName: "Cached Publisher",
            publisherId: "pub-id"
          }
        }
      ];

      fs.writeJSONSync(
        path.join(tempFolder, "extensions.json"),
        extensionsJson
      );

      const result = InstalledExtensionsService.GetInstalledExtensionsFromFolder(
        tempFolder
      );

      expect(result).to.have.length(1);
      expect(result[0].name).to.eq("cached-ext");
      expect(result[0].publisher).to.eq("publisher");
      expect(result[0].version).to.eq("1.0.0");
    });

    it("should read extensions from directories with package.json and skip obsolete ones", () => {
      // 1. Regular extension directory
      const extDir1 = path.join(tempFolder, "author.ext-one-1.0.0");
      fs.mkdirpSync(extDir1);
      fs.writeJSONSync(path.join(extDir1, "package.json"), {
        name: "ext-one",
        publisher: "author",
        version: "1.0.0"
      });

      // 2. Obsolete extension directory
      const extDir2 = path.join(tempFolder, "author.ext-old-0.9.0");
      fs.mkdirpSync(extDir2);
      fs.writeJSONSync(path.join(extDir2, "package.json"), {
        name: "ext-old",
        publisher: "author",
        version: "0.9.0"
      });

      // 3. Builtin extension directory
      const extDir3 = path.join(tempFolder, "author.builtin-ext-1.0.0");
      fs.mkdirpSync(extDir3);
      fs.writeJSONSync(path.join(extDir3, "package.json"), {
        name: "builtin-ext",
        publisher: "author",
        version: "1.0.0",
        isBuiltin: true
      });

      // Write .obsolete file
      fs.writeJSONSync(path.join(tempFolder, ".obsolete"), {
        "author.ext-old-0.9.0": true
      });

      const result = InstalledExtensionsService.GetInstalledExtensionsFromFolder(
        tempFolder
      );

      expect(result).to.have.length(1);
      expect(result[0].name).to.eq("ext-one");
      expect(result[0].publisher).to.eq("author");
    });
  });

  describe("MergeFromExtensionFolder", () => {
    it("should merge disk-installed extensions and mark missing ones as disabled: true", () => {
      const enabledExt = new ExtensionInformation();
      enabledExt.name = "active-ext";
      enabledExt.publisher = "sample";
      enabledExt.version = "1.0.0";
      enabledExt.disabled = false;
      enabledExt.metadata = new ExtensionMetadata("", "", "", "", "", "");

      // Create disabled extension on disk
      const disabledExtDir = path.join(tempFolder, "sample.disabled-ext-2.0.0");
      fs.mkdirpSync(disabledExtDir);
      fs.writeJSONSync(path.join(disabledExtDir, "package.json"), {
        name: "disabled-ext",
        publisher: "sample",
        version: "2.0.0"
      });

      const merged = InstalledExtensionsService.MergeFromExtensionFolder(
        [enabledExt],
        tempFolder
      );

      expect(merged).to.have.length(2);
      expect(merged[0].name).to.eq("active-ext");
      expect(merged[0].disabled).to.be.false;
      expect(merged[1].name).to.eq("disabled-ext");
      expect(merged[1].disabled).to.be.true;
    });

    it("should not duplicate or mark already enabled extensions as disabled", () => {
      const enabledExt = new ExtensionInformation();
      enabledExt.name = "my-ext";
      enabledExt.publisher = "my-pub";
      enabledExt.version = "1.0.0";
      enabledExt.disabled = false;
      enabledExt.metadata = new ExtensionMetadata("", "", "", "", "", "");

      const extDir = path.join(tempFolder, "my-pub.my-ext-1.0.0");
      fs.mkdirpSync(extDir);
      fs.writeJSONSync(path.join(extDir, "package.json"), {
        name: "my-ext",
        publisher: "my-pub",
        version: "1.0.0"
      });

      const merged = InstalledExtensionsService.MergeFromExtensionFolder(
        [enabledExt],
        tempFolder
      );

      expect(merged).to.have.length(1);
      expect(merged[0].name).to.eq("my-ext");
      expect(merged[0].disabled).to.be.false;
    });
  });

  describe("ExtensionInformation Serialization", () => {
    it("should serialize and deserialize disabled property correctly", () => {
      const jsonListStr = JSON.stringify([
        {
          name: "ext-enabled",
          publisher: "pub",
          version: "1.0.0",
          disabled: false,
          metadata: {}
        },
        {
          name: "ext-disabled",
          publisher: "pub",
          version: "2.0.0",
          disabled: true,
          metadata: {}
        }
      ]);

      const list = ExtensionInformation.fromJSONList(jsonListStr);
      expect(list).to.have.length(2);
      expect(list[0].name).to.eq("ext-enabled");
      expect(list[0].disabled).to.be.false;
      expect(list[1].name).to.eq("ext-disabled");
      expect(list[1].disabled).to.be.true;
    });
  });
});
