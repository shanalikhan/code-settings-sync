// The stub has to be imported before anything that loads "vscode".
import { answers, recorded, ResetStub, usingStub } from "./vscode.stub";

import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { OsType } from "../../../src/enums/osType.enum";
import { SyncMethod } from "../../../src/enums/syncMethod.enum";
import { CustomConfig } from "../../../src/models/customConfig.model";
import { ExtensionConfig } from "../../../src/models/extensionConfig.model";
import { IExtensionState } from "../../../src/models/state.model";
import { FileSystemService } from "../../../src/service/filesystem/filesystem.service";
import { FileService } from "../../../src/service/file.service";
import { state as globalState } from "../../../src/state";

interface IMachine {
  state: IExtensionState;
  user: string;
  custom: CustomConfig;
  ext: ExtensionConfig;
  summaries: unknown[][];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function Environment(user: string, osType: OsType) {
  return {
    USER_FOLDER: user + path.sep,
    OsType: osType,
    FILE_EXTENSION_NAME: "extensions.json",
    FILE_EXTENSION: path.join(user, "extensions.json"),
    FILE_SETTING_NAME: "settings.json",
    FILE_KEYBINDING_MAC: "keybindingsMac.json",
    getVersion: () => "3.4.4"
  };
}

function Machine(
  user: string,
  osType: OsType,
  configure: (custom: CustomConfig, ext: ExtensionConfig) => void
): IMachine {
  globalState.environment = Environment(user, osType) as any;
  const machine: IMachine = {
    state: null,
    user,
    custom: new CustomConfig(),
    ext: new ExtensionConfig(),
    summaries: []
  };
  configure(machine.custom, machine.ext);
  const commons = {
    ERROR_MESSAGE: "Sync: error",
    InitalizeSettings: async () => ({
      publicGist: false,
      userName: null,
      name: null,
      extConfig: clone(machine.ext),
      customConfig: clone(machine.custom)
    }),
    GetCustomSettings: async () => clone(machine.custom),
    SetCustomSettings: async (custom: CustomConfig) => {
      machine.custom = clone(custom);
      return true;
    },
    GetSettings: () => clone(machine.ext),
    SaveSettings: async (ext: ExtensionConfig) => {
      machine.ext = clone(ext);
      return true;
    },
    ShowSummaryOutput: (...args: unknown[]) => machine.summaries.push(args),
    webviewService: { UpdateSettingsPage: () => undefined }
  };
  machine.state = {
    instanceID: "test",
    commons: commons as any,
    environment: Environment(user, osType) as any,
    watcher: {
      HandleStartWatching: async () => undefined,
      HandleStopWatching: async () => undefined
    } as any
  };
  return machine;
}

describe("FileSystemService", function() {
  let root: string;
  let folder: string;

  before(function() {
    if (!usingStub) {
      // Inside the VS Code test host the real API would open dialogs.
      this.skip();
    }
  });

  beforeEach(async () => {
    ResetStub();
    root = await fs.mkdtemp(path.join(os.tmpdir(), "settings-sync-service-"));
    folder = path.join(root, "OneDrive", "vscode-settings");
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  function UseFolder(custom: CustomConfig, ext: ExtensionConfig) {
    custom.syncMethod = SyncMethod.FileSystem;
    custom.fileSystemSettings.path = folder;
    ext.quietSync = true;
  }

  it("exports from macOS and imports on Linux and macOS", async () => {
    const macUser = path.join(root, "mac", "User");
    await fs.outputFile(
      path.join(macUser, "settings.json"),
      '{\n  // @sync os=linux\n  "linuxOnly": 1,\n  // @sync os=mac\n  "macOnly": 1\n}'
    );
    await fs.outputFile(path.join(macUser, "keybindings.json"), '["mac"]');
    await fs.outputFile(path.join(macUser, "snippets", "go.json"), "{}");
    await fs.outputFile(path.join(macUser, "state.vscdb"), "binary");
    await fs.outputFile(path.join(root, "mac", ".eslintrc"), "root: true");
    const mac = Machine(macUser, OsType.Mac, custom => {
      custom.customFiles = { ".eslintrc": path.join(root, "mac", ".eslintrc") };
    });
    UseFolder(mac.custom, mac.ext);

    await new FileSystemService(mac.state).Export();

    expect(recorded.errors).to.deep.equal([]);
    expect(await fs.pathExists(path.join(folder, "keybindingsMac.json"))).to.be
      .true;
    expect(await fs.pathExists(path.join(folder, "keybindings.json"))).to.be
      .false;
    expect(await fs.pathExists(path.join(folder, "state.vscdb"))).to.be.false;
    expect(
      await fs.readFile(path.join(folder, "snippets", "go.json"), "utf8")
    ).to.equal("{}");
    expect(
      await fs.readFile(
        path.join(folder, "customized_sync", ".eslintrc"),
        "utf8"
      )
    ).to.equal("root: true");
    expect(
      JSON.parse(
        await fs.readFile(path.join(folder, "extensions.json"), "utf8")
      )
    ).to.deep.equal([]);
    const metadata = JSON.parse(
      await fs.readFile(path.join(folder, "cloudSettings"), "utf8")
    );
    expect(metadata.extensionVersion).to.equal("v3.4.4");
    expect(
      new Date(mac.custom.fileSystemSettings.lastUpload).getTime()
    ).to.equal(new Date(metadata.lastUpload).getTime());

    const linuxUser = path.join(root, "linux", "User");
    await fs.outputFile(path.join(linuxUser, "settings.json"), "{}");
    await fs.outputFile(path.join(linuxUser, "keybindings.json"), '["linux"]');
    const linux = Machine(linuxUser, OsType.Linux, custom => {
      custom.customFiles = {
        ".eslintrc": path.join(root, "linux", "home", ".eslintrc")
      };
    });
    UseFolder(linux.custom, linux.ext);

    await new FileSystemService(linux.state).Import();

    expect(recorded.errors).to.deep.equal([]);
    const linuxSettings = await fs.readFile(
      path.join(linuxUser, "settings.json"),
      "utf8"
    );
    expect(linuxSettings).to.match(/\n\s+"linuxOnly": 1/);
    expect(linuxSettings).to.match(/\/\/\s*"macOnly": 1/);
    expect(
      await fs.readFile(path.join(linuxUser, "keybindings.json"), "utf8")
    ).to.equal('["linux"]');
    expect(
      await fs.readFile(path.join(linuxUser, "snippets", "go.json"), "utf8")
    ).to.equal("{}");
    expect(
      await fs.readFile(path.join(root, "linux", "home", ".eslintrc"), "utf8")
    ).to.equal("root: true");
    expect(
      new Date(linux.custom.fileSystemSettings.lastDownload).getTime()
    ).to.equal(new Date(metadata.lastUpload).getTime());

    const otherMacUser = path.join(root, "mac2", "User");
    const otherMac = Machine(otherMacUser, OsType.Mac, () => undefined);
    UseFolder(otherMac.custom, otherMac.ext);
    await new FileSystemService(otherMac.state).Import();
    expect(
      await fs.readFile(path.join(otherMacUser, "keybindings.json"), "utf8")
    ).to.equal('["mac"]');
  });

  it("round-trips intentionally empty ordinary and custom files", async () => {
    const sourceUser = path.join(root, "empty-source", "User");
    const sourceCustom = path.join(root, "empty-source", ".eslintrc");
    await fs.outputFile(path.join(sourceUser, "settings.json"), "{}");
    await fs.outputFile(path.join(sourceUser, "snippets", "empty.json"), "");
    await fs.outputFile(sourceCustom, "");
    const source = Machine(sourceUser, OsType.Linux, custom => {
      custom.customFiles = { ".eslintrc": sourceCustom };
    });
    UseFolder(source.custom, source.ext);

    await new FileSystemService(source.state).Export();

    expect(await fs.readFile(path.join(folder, "snippets", "empty.json"), "utf8"))
      .to.equal("");
    expect(
      await fs.readFile(path.join(folder, "customized_sync", ".eslintrc"), "utf8")
    ).to.equal("");
    const metadata = JSON.parse(
      await fs.readFile(path.join(folder, "cloudSettings"), "utf8")
    );
    expect(metadata.files).to.include("snippets|empty.json");
    expect(metadata.files).to.include("|customized_sync|.eslintrc");

    const destinationUser = path.join(root, "empty-destination", "User");
    const destinationCustom = path.join(root, "empty-destination", ".eslintrc");
    await fs.outputFile(path.join(destinationUser, "snippets", "empty.json"), "stale");
    await fs.outputFile(destinationCustom, "stale");
    const destination = Machine(destinationUser, OsType.Linux, custom => {
      custom.customFiles = { ".eslintrc": destinationCustom };
    });
    UseFolder(destination.custom, destination.ext);

    await new FileSystemService(destination.state).Import();

    expect(recorded.errors).to.deep.equal([]);
    expect(
      await fs.readFile(path.join(destinationUser, "snippets", "empty.json"), "utf8")
    ).to.equal("");
    expect(await fs.readFile(destinationCustom, "utf8")).to.equal("");
    expect(destination.custom.fileSystemSettings.lastDownload).not.to.be.null;
  });

  it("restores only manifest-declared files from a shared sync folder", async () => {
    const sourceUser = path.join(root, "manifest-source", "User");
    await fs.outputFile(path.join(sourceUser, "settings.json"), '{ "verified": 1 }');
    const source = Machine(sourceUser, OsType.Linux, () => undefined);
    UseFolder(source.custom, source.ext);
    await new FileSystemService(source.state).Export();

    // Unrelated or injected files in the shared folder must not be imported.
    await fs.outputFile(path.join(folder, "snippets", "unlisted.json"), '{ "injected": true }');
    const destinationUser = path.join(root, "manifest-destination", "User");
    const destination = Machine(destinationUser, OsType.Linux, () => undefined);
    UseFolder(destination.custom, destination.ext);
    await new FileSystemService(destination.state).Import();

    expect(recorded.errors).to.deep.equal([]);
    expect(await fs.readFile(path.join(destinationUser, "settings.json"), "utf8"))
      .to.equal('{ "verified": 1 }');
    expect(await fs.pathExists(path.join(destinationUser, "snippets", "unlisted.json")))
      .to.be.false;
  });

  it("ignores custom files absent from an authoritative export manifest", async () => {
    const sourceUser = path.join(root, "custom-source", "User");
    await fs.outputFile(path.join(sourceUser, "settings.json"), '{ "verified": 1 }');
    const source = Machine(sourceUser, OsType.Linux, () => undefined);
    UseFolder(source.custom, source.ext);
    await new FileSystemService(source.state).Export();

    const metadata = JSON.parse(
      await fs.readFile(path.join(folder, "cloudSettings"), "utf8")
    );
    expect(metadata.files).not.to.include("|customized_sync|.eslintrc");
    // A stale/injected file is not in the completed export's manifest and
    // must not be restored to an arbitrary configured path outside USER_FOLDER.
    await fs.outputFile(path.join(folder, "customized_sync", ".eslintrc"), "injected");
    const target = path.join(root, "custom-destination", "home", ".eslintrc");
    const destinationUser = path.join(root, "custom-destination", "User");
    const destination = Machine(destinationUser, OsType.Linux, custom => {
      custom.customFiles = { ".eslintrc": target };
    });
    UseFolder(destination.custom, destination.ext);
    await new FileSystemService(destination.state).Import();

    expect(recorded.errors).to.deep.equal([]);
    expect(await fs.pathExists(target)).to.be.false;
    expect(await fs.readFile(path.join(destinationUser, "settings.json"), "utf8"))
      .to.equal('{ "verified": 1 }');
  });

  it("rejects manifest names that collide on another file system", async () => {
    await fs.outputFile(path.join(folder, "settings.json"), '{ "remote": 1 }');
    await fs.outputFile(path.join(folder, "SETTINGS.JSON"), '{ "alias": 1 }');
    await fs.outputJson(path.join(folder, "cloudSettings"), {
      lastUpload: "2026-10-08T00:00:00.000Z",
      files: ["settings.json", "SETTINGS.JSON"]
    });

    const destinationUser = path.join(root, "collision-destination", "User");
    await fs.outputFile(path.join(destinationUser, "settings.json"), '{ "local": 1 }');
    const destination = Machine(destinationUser, OsType.Linux, () => undefined);
    UseFolder(destination.custom, destination.ext);
    await new FileSystemService(destination.state).Import();

    expect(recorded.errors).to.have.length(1);
    expect(recorded.errors[0]).to.match(/invalid or duplicate/i);
    expect(await fs.readFile(path.join(destinationUser, "settings.json"), "utf8"))
      .to.equal('{ "local": 1 }');
    expect(destination.custom.fileSystemSettings.lastDownload).to.be.null;
  });

  it("fails an incomplete export before writing files or recording lastDownload", async () => {
    const sourceUser = path.join(root, "missing-source", "User");
    await fs.outputFile(path.join(sourceUser, "settings.json"), '{ "remote": 1 }');
    await fs.outputFile(path.join(sourceUser, "snippets", "required.json"), '{}');
    const source = Machine(sourceUser, OsType.Linux, () => undefined);
    UseFolder(source.custom, source.ext);
    await new FileSystemService(source.state).Export();

    await fs.remove(path.join(folder, "snippets", "required.json"));
    const destinationUser = path.join(root, "missing-destination", "User");
    const destination = Machine(destinationUser, OsType.Linux, () => undefined);
    UseFolder(destination.custom, destination.ext);
    await new FileSystemService(destination.state).Import();

    expect(recorded.errors).to.have.length(1);
    expect(recorded.errors[0]).to.match(/incomplete/i);
    expect(await fs.pathExists(path.join(destinationUser, "settings.json"))).to.be.false;
    expect(destination.custom.fileSystemSettings.lastDownload).to.be.null;
  });

  it("skips an import that is already applied unless forceDownload is on", async () => {
    const userA = path.join(root, "a", "User");
    await fs.outputFile(path.join(userA, "settings.json"), '{ "a": 1 }');
    const a = Machine(userA, OsType.Linux, () => undefined);
    UseFolder(a.custom, a.ext);
    await new FileSystemService(a.state).Export();

    const userB = path.join(root, "b", "User");
    const b = Machine(userB, OsType.Linux, () => undefined);
    UseFolder(b.custom, b.ext);
    await new FileSystemService(b.state).Import();
    await fs.writeFile(path.join(userB, "settings.json"), '{ "local": 1 }');

    await new FileSystemService(b.state).Import();
    expect(
      await fs.readFile(path.join(userB, "settings.json"), "utf8")
    ).to.equal('{ "local": 1 }');

    b.ext.forceDownload = true;
    await new FileSystemService(b.state).Import();
    expect(
      await fs.readFile(path.join(userB, "settings.json"), "utf8")
    ).to.equal('{ "a": 1 }');
  });


  it("leaves failed file writes pending so the next import can retry", async () => {
    const userA = path.join(root, "source", "User");
    await fs.outputFile(path.join(userA, "settings.json"), '{ "remote": 1 }');
    const source = Machine(userA, OsType.Linux, () => undefined);
    UseFolder(source.custom, source.ext);
    await new FileSystemService(source.state).Export();

    const userB = path.join(root, "destination", "User");
    const destination = Machine(userB, OsType.Linux, () => undefined);
    UseFolder(destination.custom, destination.ext);
    const target = path.join(userB, "settings.json");
    const originalWrite = FileService.WriteFile;
    FileService.WriteFile = async (filename, data) =>
      filename === target ? false : originalWrite(filename, data);
    try {
      await new FileSystemService(destination.state).Import();
    } finally {
      FileService.WriteFile = originalWrite;
    }

    expect(recorded.errors).to.have.length(1);
    expect(destination.custom.fileSystemSettings.lastDownload).to.be.null;
    expect(await fs.pathExists(target)).to.be.false;

    await new FileSystemService(destination.state).Import();
    expect(await fs.readFile(target, "utf8")).to.equal('{ "remote": 1 }');
    expect(destination.custom.fileSystemSettings.lastDownload).not.to.be.null;
  });

  it("does not mark the import complete if saving local sync options fails", async () => {
    const userA = path.join(root, "source", "User");
    await fs.outputFile(path.join(userA, "settings.json"), '{ "remote": 2 }');
    const source = Machine(userA, OsType.Linux, () => undefined);
    UseFolder(source.custom, source.ext);
    await new FileSystemService(source.state).Export();

    const userB = path.join(root, "destination", "User");
    const destination = Machine(userB, OsType.Linux, () => undefined);
    UseFolder(destination.custom, destination.ext);
    const commons = destination.state.commons as any;
    const originalSave = commons.SaveSettings;
    commons.SaveSettings = async () => false;
    try {
      await new FileSystemService(destination.state).Import();
    } finally {
      commons.SaveSettings = originalSave;
    }

    expect(recorded.errors).to.have.length(1);
    expect(destination.custom.fileSystemSettings.lastDownload).to.be.null;
    const target = path.join(userB, "settings.json");
    await fs.writeFile(target, '{ "local": 2 }');

    await new FileSystemService(destination.state).Import();
    expect(await fs.readFile(target, "utf8")).to.equal('{ "remote": 2 }');
    expect(destination.custom.fileSystemSettings.lastDownload).not.to.be.null;
  });

  it("asks before replacing a newer export from another machine", async () => {
    const userA = path.join(root, "a", "User");
    await fs.outputFile(path.join(userA, "settings.json"), '{ "a": 1 }');
    const a = Machine(userA, OsType.Linux, () => undefined);
    UseFolder(a.custom, a.ext);
    await new FileSystemService(a.state).Export();

    const userB = path.join(root, "b", "User");
    await fs.outputFile(path.join(userB, "settings.json"), '{ "b": 1 }');
    const b = Machine(userB, OsType.Linux, () => undefined);
    UseFolder(b.custom, b.ext);

    answers.info.push("No");
    await new FileSystemService(b.state).Export();
    expect(recorded.info).to.have.length(1);
    expect(
      await fs.readFile(path.join(folder, "settings.json"), "utf8")
    ).to.equal('{ "a": 1 }');

    answers.info.push("Yes");
    await new FileSystemService(b.state).Export();
    expect(
      await fs.readFile(path.join(folder, "settings.json"), "utf8")
    ).to.equal('{ "b": 1 }');
  });

  it("removes deleted local keybindings while retaining the other OS copy", async () => {
    const macUser = path.join(root, "mac-keybindings", "User");
    await fs.outputFile(path.join(macUser, "keybindings.json"), '["mac"]');
    const mac = Machine(macUser, OsType.Mac, () => undefined);
    UseFolder(mac.custom, mac.ext);
    await new FileSystemService(mac.state).Export();

    const linuxUser = path.join(root, "linux-keybindings", "User");
    await fs.outputFile(path.join(linuxUser, "keybindings.json"), '["linux"]');
    const linux = Machine(linuxUser, OsType.Linux, (_custom, ext) => {
      // The first export intentionally combines this machine with the existing
      // macOS export without asking the newer-export confirmation question.
      ext.forceUpload = true;
    });
    UseFolder(linux.custom, linux.ext);
    await new FileSystemService(linux.state).Export();
    linux.ext.forceUpload = false;

    expect(
      await fs.pathExists(path.join(folder, "keybindings.json"))
    ).to.be.true;
    expect(await fs.pathExists(path.join(folder, "keybindingsMac.json"))).to.be
      .true;

    await fs.remove(path.join(linuxUser, "keybindings.json"));
    await new FileSystemService(linux.state).Export();

    expect(await fs.pathExists(path.join(folder, "keybindings.json"))).to.be
      .false;
    expect(await fs.readFile(path.join(folder, "keybindingsMac.json"), "utf8"))
      .to.equal('["mac"]');
    const metadata = JSON.parse(
      await fs.readFile(path.join(folder, "cloudSettings"), "utf8")
    );
    expect(metadata.files).not.to.include("keybindings.json");
    expect(metadata.files).to.include("keybindingsMac.json");
  });

  it("leaves an unchanged export alone and removes deleted snippets", async () => {
    const user = path.join(root, "a", "User");
    await fs.outputFile(path.join(user, "settings.json"), "{}");
    await fs.outputFile(path.join(user, "snippets", "go.json"), "{}");
    const a = Machine(user, OsType.Linux, () => undefined);
    UseFolder(a.custom, a.ext);
    await new FileSystemService(a.state).Export();
    const first = await fs.readFile(path.join(folder, "cloudSettings"), "utf8");

    await new FileSystemService(a.state).Export();
    expect(
      await fs.readFile(path.join(folder, "cloudSettings"), "utf8")
    ).to.equal(first);

    await fs.remove(path.join(user, "snippets", "go.json"));
    await new FileSystemService(a.state).Export();
    expect(await fs.pathExists(path.join(folder, "snippets", "go.json"))).to.be
      .false;
  });

  it("asks for a folder when none is set and switches to File System sync", async () => {
    const user = path.join(root, "a", "User");
    await fs.outputFile(path.join(user, "settings.json"), "{}");
    const a = Machine(user, OsType.Linux, (_custom, ext) => {
      ext.quietSync = true;
    });
    answers.openDialog = folder;

    await new FileSystemService(a.state).Export();

    expect(a.custom.syncMethod).to.equal(SyncMethod.FileSystem);
    expect(a.custom.fileSystemSettings.path).to.equal(folder);
    expect(await fs.pathExists(path.join(folder, "settings.json"))).to.be.true;
  });

  it("refuses a folder inside the user folder", async () => {
    const user = path.join(root, "a", "User");
    await fs.outputFile(path.join(user, "settings.json"), "{}");
    const a = Machine(user, OsType.Linux, () => undefined);
    UseFolder(a.custom, a.ext);
    a.custom.fileSystemSettings.path = path.join(user, "backup");

    await new FileSystemService(a.state).Export();

    expect(recorded.errors).to.have.length(1);
    expect(recorded.errors[0]).to.match(/user folder/);
    expect(await fs.pathExists(path.join(user, "backup"))).to.be.false;
  });

  it("rejects a metadata-only legacy export before recording or trusting lastDownload", async () => {
    const user = path.join(root, "a", "User");
    const a = Machine(user, OsType.Linux, () => undefined);
    UseFolder(a.custom, a.ext);
    const exportedAt = "2026-10-08T06:00:00.000Z";
    await fs.outputFile(
      path.join(folder, "cloudSettings"),
      JSON.stringify({ lastUpload: exportedAt, extensionVersion: "v3.4.4" })
    );

    // Old legacy metadata was enough to mark an empty import complete.
    await new FileSystemService(a.state).Import();
    expect(recorded.errors).to.have.length(1);
    expect(recorded.errors[0]).to.match(/No exported settings/);
    expect(a.custom.fileSystemSettings.lastDownload).to.equal(null);

    // Also refuse a previous (incorrect) empty-import receipt: do not take
    // the timestamp-only IsUpToDate short-circuit before payload validation.
    ResetStub();
    a.custom.fileSystemSettings.lastDownload = new Date(exportedAt);
    await new FileSystemService(a.state).Import();
    expect(recorded.errors).to.have.length(1);
    expect(recorded.errors[0]).to.match(/No exported settings/);
    expect(a.summaries).to.have.length(0);
  });

  it("keeps custom-file-only legacy imports valid without cloudSettings", async () => {
    const user = path.join(root, "legacy-custom", "User");
    const destination = path.join(root, "legacy-custom", ".eslintrc");
    await fs.outputFile(
      path.join(folder, "customized_sync", ".eslintrc"),
      '{ "legacy": true }'
    );
    const a = Machine(user, OsType.Linux, custom => {
      custom.customFiles = { ".eslintrc": destination };
    });
    UseFolder(a.custom, a.ext);

    await new FileSystemService(a.state).Import();

    expect(recorded.errors).to.deep.equal([]);
    expect(await fs.readFile(destination, "utf8")).to.equal('{ "legacy": true }');
    expect(a.custom.fileSystemSettings.lastDownload).to.equal(null);
  });

  it("reports a folder without exported settings", async () => {
    const user = path.join(root, "a", "User");
    const a = Machine(user, OsType.Linux, () => undefined);
    UseFolder(a.custom, a.ext);
    await fs.ensureDir(folder);

    await new FileSystemService(a.state).Import();

    expect(recorded.errors).to.have.length(1);
    expect(recorded.errors[0]).to.match(/No exported settings/);
  });

  it("shows the summary page unless quiet sync is on", async () => {
    const user = path.join(root, "a", "User");
    await fs.outputFile(path.join(user, "settings.json"), "{}");
    const a = Machine(user, OsType.Linux, () => undefined);
    UseFolder(a.custom, a.ext);
    a.ext.quietSync = false;

    await new FileSystemService(a.state).Export();

    expect(a.summaries).to.have.length(1);
    expect(a.summaries[0][0]).to.equal(true);
  });
});
