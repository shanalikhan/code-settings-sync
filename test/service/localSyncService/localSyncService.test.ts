import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { LocalSyncSettings } from "../../../src/models/localSyncSettings.model";
import { File } from "../../../src/service/file.service";
import { LocalSyncService } from "../../../src/service/localSync.service";

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
  });

  it("should import files from the selected folder", async () => {
    await fs.writeFile(
      path.join(syncFolder, "settings.json"),
      '{"editor.fontSize": 14}'
    );

    const files = await LocalSyncService.ImportFiles(syncFolder);

    expect(files.map(file => file.fileName)).to.contain("settings.json");
    expect(files.map(file => file.content)).to.contain(
      '{"editor.fontSize": 14}'
    );
  });

  it("should read and write local sync settings", async () => {
    const settingsPath = path.join(syncFolder, "syncLocalSettings.json");
    const settings = new LocalSyncSettings();
    settings.folderPath = syncFolder;

    const written = await LocalSyncService.WriteSettings(settingsPath, settings);
    const actual = await LocalSyncService.ReadSettings(settingsPath);

    expect(written).to.be.equals(true);
    expect(actual.folderPath).to.be.equals(syncFolder);
  });

  it("should return default settings if local settings file does not exist", async () => {
    const actual = await LocalSyncService.ReadSettings(
      path.join(syncFolder, "syncLocalSettings.json")
    );

    expect(actual.folderPath).to.be.equals("");
  });
});
