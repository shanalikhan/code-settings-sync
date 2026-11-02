import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { CustomConfig } from "../../../src/models/customConfig.model";
import { File, FileService } from "../../../src/service/file.service";

describe("FileService", () => {
  it("should get custom file info", async () => {
    const expected = new File(
      "dummyrc",
      '{\n  "hoge": true,\n}',
      __dirname + "/../../../../test/service/fileService/dummyrc",
      "|customized_sync|dummyrc"
    );
    const actual = await FileService.GetCustomFile(
      __dirname + "/../../../../test/service/fileService/dummyrc", // __dirname => out/src/test/service
      "dummyrc"
    );
    expect(actual).to.deep.equals(expected);
  });

  it("should return null if file does not exists", async () => {
    const actual = await FileService.GetCustomFile(
      __dirname + "/../../../../test/service/fileService/hoge",
      "hoge"
    );
    expect(actual).to.be.equals(null);
  });

  it("should join by path separator", () => {
    const actual = FileService.ConcatPath(
      "/User/path/to",
      "hoge/piyo",
      "hoge.txt"
    );
    expect(actual).to.be.equals("/User/path/to/hoge/piyo/hoge.txt");
  });

  it("should never list files of a .git folder", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-list-"));
    try {
      fs.outputFileSync(path.join(dir, "settings.json"), "{}");
      fs.outputFileSync(path.join(dir, ".git", "objects.json"), "{}");
      const customSettings = {
        ignoreUploadFiles: [],
        ignoreUploadFolders: [],
        supportedFileExtensions: ["json"]
      } as CustomConfig;
      const files = await FileService.ListFiles(dir, customSettings);
      expect(files.map(f => f.fileName)).to.deep.equal(["settings.json"]);
    } finally {
      fs.removeSync(dir);
    }
  });
});
