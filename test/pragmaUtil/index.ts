import { expect } from "chai";
import fs = require("fs");
import { OsType } from "../../src/enums";
import PragmaUtil from "../../src/pragmaUtil";

let testSettings = null;

describe("Process before upload", function() {
  this.beforeAll(() => {
    testSettings = fs.readFileSync(
      __dirname + "/../../../test/pragmaUtil/testSettings.json",
      "utf8"
    );
  });

  it("should remove @sync-ignore and @sync ignore lines", () => {
    expect(PragmaUtil.removeIgnoreBlocks(testSettings))
      .to.not.contains("@sync-ignore")
      .and.not.contains("@sync ignore");
  });

  it("should trim os, host and env", () => {
    expect(PragmaUtil.processBeforeUpload(testSettings)).to.match(
      /@sync os=linux host=trim env=TEST_ENV/
    );
  });

  it("should comment line after linebreak", () => {
    const line = '// @sync host=mac1 os=_mac_\n\t"mac": 3,';
    expect(PragmaUtil.commentLineAfterBreak(line)).to.match(/\/\/\s*"mac"/);
  });

  it("should uncomment line after linebreak", () => {
    const line = '// @sync host=mac1 os=_mac_\n\t//"mac": 3,';
    expect(PragmaUtil.uncommentLineAfterBreak(line)).to.match(/\s*"mac"/);
  });

  it("should get eight @sync pragma valid lines", () => {
    const processed = PragmaUtil.processBeforeUpload(testSettings);
    expect(PragmaUtil.matchPragmaSettings(processed).length).to.be.equals(8);
  });

  it("should uncomment all lines", () => {
    const commentedSettings = `
      // @sync os=linux
      // "window": 1,
      // @sync os=mac
      // "mac": 1
    `;

    expect(PragmaUtil.processBeforeUpload(commentedSettings))
      .to.match(/\s+"window"/)
      .and.to.match(/\s+"mac"/);
  });

  it("should uncomment lines before write file for os=linux", () => {
    const commentedSettings = `{
      // @sync os=linux
      // "linux": 1,
      // @sync os=mac
        "mac": 1
    }`;
    const processed = PragmaUtil.processBeforeWrite(
      commentedSettings,
      commentedSettings,
      OsType.Linux,
      null
    );
    expect(processed)
      .to.match(/\s+"linux"/)
      .and.to.match(/.+\/\/"mac"/);
  });

  it("should not comment os=linux settings lines", () => {
    let processed = PragmaUtil.processBeforeUpload(testSettings);
    processed = PragmaUtil.processBeforeWrite(
      processed,
      processed,
      OsType.Linux,
      null
    );
    expect(processed).to.match(/\s+"not_commented"/);
  });

  it("should leave only settings that matches with os=mac host=mac2 env=TEST_ENV", () => {
    const processed = PragmaUtil.processBeforeUpload(testSettings);
    // tslint:disable-next-line:no-string-literal
    process.env["TEST_ENV"] = "1";
    expect(
      PragmaUtil.processBeforeWrite(processed, processed, OsType.Mac, "mac2")
    )
      .to.match(/\n\s+"mac2"/)
      .and.match(/\n\s+"mactest"/);
  });

  it("should remove all comments and parse JSON", () => {
    const possibleJson = PragmaUtil.removeAllComments(testSettings);
    expect(JSON.parse.bind(null, possibleJson)).to.not.throw();
  });
});
