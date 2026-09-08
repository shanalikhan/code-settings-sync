import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { File } from "../../../src/service/file.service";
import { LocalSyncService } from "../../../src/service/localSync.service";

function createImportConfig() {
  return {
    ignoreUploadFiles: [
      "state.*",
      "syncLocalSettings.json",
      ".DS_Store",
      "sync.lock"
    ],
    ignoreUploadFolders: ["workspaceStorage"],
    supportedFileExtensions: ["json", "code-snippets"]
  } as any;
}

describe("LocalSyncService", () => {
  let syncFolder: string;

  beforeEach(async () => {
    syncFolder = await fs.mkdtemp(path.join(os.tmpdir(), "settings-sync-"));
  });

  afterEach(async () => {
    await fs.remove(syncFolder);
  });

  it("should export files to the selected folder", async () => {
    const files = [
      new File("settings.json", '{"editor.tabSize": 2}', "", "settings.json"),
      new File(
        "snippets.code-snippets",
        '{"hello": {"body": "world"}}',
        "",
        "snippets|snippets.code-snippets"
      ),
      new File(
        "cloudSettings",
        '{"lastUpload":"2020-01-01"}',
        "",
        "cloudSettings"
      )
    ];

    const result = await LocalSyncService.ExportFiles(syncFolder, files);

    expect(result).to.be.equals(true);
    expect(
      await fs.readFile(path.join(syncFolder, "settings.json"), "utf8")
    ).to.be.equals('{"editor.tabSize": 2}');
    expect(
      await fs.readFile(
        path.join(syncFolder, "snippets", "snippets.code-snippets"),
        "utf8"
      )
    ).to.be.equals('{"hello": {"body": "world"}}');
    expect(
      await fs.readFile(path.join(syncFolder, "cloudSettings.json"), "utf8")
    ).to.be.equals('{"lastUpload":"2020-01-01"}');
  });

  it("should import files from the selected folder with relative gist names", async () => {
    await fs.writeFile(
      path.join(syncFolder, "settings.json"),
      '{"editor.fontSize": 14}'
    );
    await fs.mkdirs(path.join(syncFolder, "snippets"));
    await fs.writeFile(
      path.join(syncFolder, "snippets", "snippets.code-snippets"),
      '{"hello": {"body": "world"}}'
    );
    await fs.writeFile(
      path.join(syncFolder, "cloudSettings.json"),
      '{"lastUpload":"2020-01-02"}'
    );
    await fs.mkdirs(path.join(syncFolder, "customized_sync"));
    await fs.writeFile(
      path.join(syncFolder, "customized_sync", ".eslintrc"),
      '{"rules":{}}'
    );

    const files = await LocalSyncService.ImportFiles(
      syncFolder,
      createImportConfig()
    );

    const names = files.map(file => file.gistName);
    expect(names).to.include("settings.json");
    expect(names).to.include("snippets|snippets.code-snippets");
    expect(names).to.include("cloudSettings");
    expect(names).to.include("|customized_sync|.eslintrc");
    expect(files.map(file => file.content)).to.include(
      '{"editor.fontSize": 14}'
    );
  });

  it("should return empty list when folder does not exist", async () => {
    const files = await LocalSyncService.ImportFiles(
      path.join(syncFolder, "missing"),
      createImportConfig()
    );
    expect(files).to.deep.equals([]);
  });

  it("should resolve ~ in folder paths", () => {
    const resolved = LocalSyncService.ResolveFolderPath("~/SyncSettings");
    expect(resolved.startsWith(os.homedir())).to.be.equals(true);
  });

  it("should map cloudSettings and customized paths", () => {
    expect(LocalSyncService.ToRelativePath("cloudSettings")).to.be.equals(
      "cloudSettings.json"
    );
    expect(
      LocalSyncService.ToRelativePath("|customized_sync|.eslintrc")
    ).to.be.equals("customized_sync|.eslintrc");
    expect(LocalSyncService.ToGistName("cloudSettings.json")).to.be.equals(
      "cloudSettings"
    );
    expect(
      LocalSyncService.ToGistName("customized_sync|.eslintrc")
    ).to.be.equals("|customized_sync|.eslintrc");
  });
});
