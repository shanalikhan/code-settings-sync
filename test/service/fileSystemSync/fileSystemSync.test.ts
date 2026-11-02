import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { File } from "../../../src/service/file.service";
import { FileSystemSyncService } from "../../../src/service/fileSystemSync.service";

describe("FileSystemSyncService", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sync-fs-"));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  it("should round trip files including nested and custom files", async () => {
    const folder = path.join(tmp, "a", "b");
    const files = [
      new File("settings.json", '{"a":1}', "", "settings.json"),
      new File("x.json", "{}", "", "snippets|x.json"),
      new File("rc", "hoge", "", "|customized_sync|rc")
    ];
    await FileSystemSyncService.ExportFiles(folder, files);
    expect(fs.existsSync(path.join(folder, "snippets", "x.json"))).to.equal(
      true
    );
    const actual = await FileSystemSyncService.ImportFiles(folder);
    const byName: { [k: string]: string } = {};
    actual.forEach(f => (byName[f.gistName] = f.content));
    expect(byName).to.deep.equal({
      "settings.json": '{"a":1}',
      "snippets|x.json": "{}",
      "|customized_sync|rc": "hoge"
    });
  });

  it("should reject path traversal", async () => {
    const files = [new File("e", "x", "", "..|..|evil")];
    let failed = false;
    try {
      await FileSystemSyncService.ExportFiles(path.join(tmp, "out"), files);
    } catch (e) {
      failed = true;
    }
    expect(failed).to.equal(true);
    expect(fs.existsSync(path.join(tmp, "evil"))).to.equal(false);
  });

  it("should fail to import a missing folder", async () => {
    let failed = false;
    try {
      await FileSystemSyncService.ImportFiles(path.join(tmp, "missing"));
    } catch (e) {
      failed = true;
    }
    expect(failed).to.equal(true);
  });
});
