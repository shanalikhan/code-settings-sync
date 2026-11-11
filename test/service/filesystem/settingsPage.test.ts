// The stub has to be imported before anything that loads "vscode".
import { usingStub } from "./vscode.stub";

import { expect } from "chai";
import * as path from "path";

import { SyncMethod } from "../../../src/enums/syncMethod.enum";
import { CustomConfig } from "../../../src/models/customConfig.model";
import { ExtensionConfig } from "../../../src/models/extensionConfig.model";
import { WebviewService } from "../../../src/service/webview.service";
import { state } from "../../../src/state";

describe("Settings page File System options", function() {
  let saved: CustomConfig[];
  let service: WebviewService;

  before(function() {
    if (!usingStub) {
      this.skip();
    }
  });

  beforeEach(() => {
    saved = [];
    state.environment = { getVersion: () => "3.4.4" } as any;
    state.context = {
      // out/test/service/filesystem -> repository root
      extensionPath: path.resolve(__dirname, "../../../.."),
      globalState: { get: () => false }
    } as any;
    state.commons = {
      SetCustomSettings: async (custom: CustomConfig) => {
        saved.push(JSON.parse(JSON.stringify(custom)));
        return true;
      },
      SaveSettings: async () => true
    } as any;
    service = new WebviewService();
  });

  function Change(custom: CustomConfig, command: string, text: string) {
    service.ReceiveSettingChange(
      { command, text, type: "global" },
      custom,
      new ExtensionConfig()
    );
  }

  it("keeps Windows paths intact in the page data", () => {
    const custom = new CustomConfig();
    custom.fileSystemSettings.path = "C:\\Users\\me\\One`Drive $& ${x}";
    custom.customFiles = { ".eslintrc": "C:\\Users\\me\\.eslintrc" };
    const page: string = (service as any).GenerateContent({
      content:
        'const globalData = JSON.parse(decodeURIComponent("@GLOBAL_DATA"));',
      items: [
        { find: "@GLOBAL_DATA", replace: "customSettings", encode: true }
      ],
      customSettings: custom
    });
    const encoded = /decodeURIComponent\("([^"]*)"\)/.exec(page)[1];
    const data = JSON.parse(decodeURIComponent(encoded));
    expect(data.fileSystemSettings.path).to.equal(
      custom.fileSystemSettings.path
    );
    expect(data.customFiles).to.deep.equal(custom.customFiles);
  });

  it("offers the sync method and folder settings", () => {
    const settings: any[] = (service as any).globalSettings;
    const method = settings.find(s => s.correspondingSetting === "syncMethod");
    const folder = settings.find(
      s => s.correspondingSetting === "fileSystemSettings.path"
    );
    expect(method.type).to.equal("select");
    expect(method.options.map(o => o.value)).to.deep.equal([
      SyncMethod.GitHubGist,
      SyncMethod.FileSystem
    ]);
    expect(folder.actionLabel)
      .to.be.a("string")
      .and.not.equal("");
  });

  it("saves a valid sync method and ignores anything else", () => {
    const custom = new CustomConfig();
    Change(custom, "syncMethod", "constructor");
    expect(saved).to.have.length(0);
    Change(custom, "syncMethod", SyncMethod.FileSystem);
    expect(saved).to.have.length(1);
    expect(saved[0].syncMethod).to.equal(SyncMethod.FileSystem);
  });

  it("trims a typed folder and forgets the old folder's timestamps", () => {
    const custom = new CustomConfig();
    custom.fileSystemSettings.path = "/old";
    custom.fileSystemSettings.lastUpload = new Date();
    custom.fileSystemSettings.lastDownload = new Date();

    Change(custom, "fileSystemSettings.path", "  /new/folder  ");

    expect(saved[0].fileSystemSettings).to.deep.equal({
      path: "/new/folder",
      lastUpload: null,
      lastDownload: null
    });
  });
});
