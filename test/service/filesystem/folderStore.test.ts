import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import {
  CheckFolder,
  ExportName,
  FolderStore,
  HasNewerExport,
  ImportName,
  IsUpToDate,
  LOCK_FILE,
  MatchesPattern,
  METADATA_FILE,
  ToFileName,
  ToRelativePath
} from "../../../src/service/filesystem/folderStore";

const filter = {
  ignoreUploadFiles: ["state.*", "syncLocalSettings.json", ".DS_Store"],
  ignoreUploadFolders: ["workspaceStorage", "globalStorage", "History"],
  supportedFileExtensions: ["json", "code-snippets"]
};

describe("FolderStore", () => {
  let root: string;
  let folder: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "settings-sync-store-"));
    folder = path.join(root, "Dropbox", "vscode");
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  describe("file names", () => {
    it("maps gist style names to folder paths and back", () => {
      const names = [
        "settings.json",
        "snippets|go.json",
        "|customized_sync|.eslintrc"
      ];
      const paths = names.map(ToRelativePath);
      expect(paths).to.deep.equal([
        "settings.json",
        path.join("snippets", "go.json"),
        path.join("customized_sync", ".eslintrc")
      ]);
      expect(paths.map(ToFileName)).to.deep.equal(names);
    });

    it("rejects names that could leave the folder", () => {
      for (const name of [
        "..|settings.json",
        "snippets||go.json",
        "|evil.json",
        "a/b.json",
        "a\\b.json",
        "|customized_sync|.."
      ]) {
        expect(() => ToRelativePath(name), name).to.throw(/Invalid/);
      }
    });
  });

  describe("CheckFolder", () => {
    it("accepts an absolute folder next to the user folder", async () => {
      const user = path.join(root, "Code", "User");
      expect(await CheckFolder(folder, user)).to.equal(null);
    });

    it("rejects empty, relative and overlapping folders", async () => {
      const user = path.join(root, "Code", "User");
      expect(await CheckFolder("  ", user)).to.equal("notSet");
      expect(await CheckFolder("Dropbox/vscode", user)).to.equal("notAbsolute");
      expect(await CheckFolder(path.join(user, "backup"), user)).to.equal(
        "overlapsUserFolder"
      );
      expect(await CheckFolder(path.join(root, "Code"), user)).to.equal(
        "overlapsUserFolder"
      );
      expect(await CheckFolder(user, user)).to.equal("overlapsUserFolder");
    });

    it("sees through a symbolic link to the user folder", async function() {
      const user = path.join(root, "Code", "User");
      await fs.ensureDir(user);
      const link = path.join(root, "link-to-user");
      try {
        await fs.symlink(user, link, "dir");
      } catch (err) {
        this.skip();
      }
      expect(await CheckFolder(path.join(link, "sync"), user)).to.equal(
        "overlapsUserFolder"
      );
    });
  });

  describe("keybindings", () => {
    it("exports macOS keybindings under their own name", () => {
      expect(ExportName("keybindings.json", true, false)).to.equal(
        "keybindingsMac.json"
      );
      expect(ExportName("keybindings.json", true, true)).to.equal(
        "keybindings.json"
      );
      expect(ExportName("keybindings.json", false, false)).to.equal(
        "keybindings.json"
      );
      expect(ExportName("settings.json", true, false)).to.equal(
        "settings.json"
      );
    });

    it("imports only the keybindings that belong to this OS", () => {
      expect(ImportName("keybindingsMac.json", true, false)).to.equal(
        "keybindings.json"
      );
      expect(ImportName("keybindings.json", true, false)).to.equal(null);
      expect(ImportName("keybindingsMac.json", false, false)).to.equal(null);
      expect(ImportName("keybindings.json", false, false)).to.equal(
        "keybindings.json"
      );
      expect(ImportName("keybindingsMac.json", true, true)).to.equal(null);
      expect(ImportName("keybindings.json", true, true)).to.equal(
        "keybindings.json"
      );
    });
  });

  describe("timestamps", () => {
    const exported = { lastUpload: "2026-10-01T10:00:00.000Z" };

    it("is up to date after importing or exporting that export", () => {
      expect(IsUpToDate(exported, exported.lastUpload, null)).to.equal(true);
      expect(
        IsUpToDate(exported, null, new Date(exported.lastUpload))
      ).to.equal(true);
      expect(IsUpToDate(exported, "2026-09-01T00:00:00.000Z", null)).to.equal(
        false
      );
      expect(IsUpToDate(null, null, null)).to.equal(false);
    });

    it("detects an export from another machine", () => {
      expect(HasNewerExport(exported, null, null)).to.equal(true);
      expect(
        HasNewerExport(exported, "2026-09-01T00:00:00.000Z", null)
      ).to.equal(true);
      expect(HasNewerExport(exported, exported.lastUpload, null)).to.equal(
        false
      );
      expect(
        HasNewerExport(exported, null, "2026-10-02T00:00:00.000Z")
      ).to.equal(false);
      expect(HasNewerExport(null, null, null)).to.equal(false);
    });
  });

  describe("MatchesPattern", () => {
    it("matches ignoreUploadFiles entries on the file name", () => {
      expect(MatchesPattern("state.vscdb", "state.*")).to.equal(true);
      expect(MatchesPattern(path.join("a", "state.json"), "state.*")).to.equal(
        true
      );
      expect(MatchesPattern("mystate.json", "state.*")).to.equal(false);
      expect(MatchesPattern(".DS_Store", ".DS_Store")).to.equal(true);
      expect(MatchesPattern("settings.json", "setting?.json")).to.equal(true);
      expect(MatchesPattern("settingsXjson", "settings.json")).to.equal(false);
    });
  });

  describe("reading and writing", () => {
    it("writes plain files and lists them back with the ignore rules", async () => {
      const store = new FolderStore(folder);
      await store.Write(
        [
          { name: "settings.json", content: '{ "a": 1 }' },
          { name: "snippets|go.json", content: "{}" },
          { name: "|customized_sync|.eslintrc", content: "root: true" }
        ],
        { lastUpload: "2026-10-01T10:00:00.000Z", extensionVersion: "v3.4.4" }
      );

      expect(
        await fs.readFile(path.join(folder, "settings.json"), "utf8")
      ).to.equal('{ "a": 1 }');
      expect(
        await fs.readFile(path.join(folder, "snippets", "go.json"), "utf8")
      ).to.equal("{}");
      expect(
        await fs.readFile(
          path.join(folder, "customized_sync", ".eslintrc"),
          "utf8"
        )
      ).to.equal("root: true");

      const metadata = await store.ReadMetadata();
      expect(metadata.lastUpload).to.equal("2026-10-01T10:00:00.000Z");
      expect(metadata.files).to.deep.equal(
        [
          "settings.json",
          "snippets|go.json",
          "|customized_sync|.eslintrc"
        ].sort()
      );

      // Things a user or another tool may leave in a shared folder.
      await fs.outputFile(path.join(folder, "state.vscdb.json"), "x");
      await fs.outputFile(path.join(folder, "History", "a.json"), "x");
      await fs.outputFile(path.join(folder, "notes.txt"), "x");
      await fs.outputFile(path.join(folder, "a.json.123.sync-tmp"), "x");

      const listed = await store.ListFiles(filter);
      expect(listed).to.deep.equal([
        { name: "settings.json", content: '{ "a": 1 }' },
        { name: "snippets|go.json", content: "{}" }
      ]);
      expect(await store.ReadFile("|customized_sync|.eslintrc")).to.equal(
        "root: true"
      );
      expect(await store.ReadFile("missing.json")).to.equal(null);
      expect(await store.ReadMetadata()).to.not.equal(null);
    });

    it("removes files the previous export wrote but keeps keybindings and foreign files", async () => {
      const store = new FolderStore(folder);
      await store.Write(
        [
          { name: "settings.json", content: "{}" },
          { name: "snippets|go.json", content: "{}" },
          { name: "keybindingsMac.json", content: "[]" }
        ],
        { lastUpload: "2026-10-01T10:00:00.000Z" }
      );
      await fs.outputFile(path.join(folder, "mine.json"), "{}");

      await store.Write([{ name: "settings.json", content: "{ }" }], {
        lastUpload: "2026-10-02T10:00:00.000Z"
      });

      expect(
        await fs.pathExists(path.join(folder, "snippets", "go.json"))
      ).to.equal(false);
      expect(
        await fs.pathExists(path.join(folder, "keybindingsMac.json"))
      ).to.equal(true);
      expect(await fs.pathExists(path.join(folder, "mine.json"))).to.equal(
        true
      );
      expect((await store.ReadMetadata()).files).to.deep.equal([
        "keybindingsMac.json",
        "settings.json"
      ]);

      // A subsequent non-Mac export must still expose the Mac bindings to
      // manifest-filtered imports, alongside its own OS-specific bindings.
      await store.Write([
        { name: "settings.json", content: "{ }" },
        { name: "keybindings.json", content: "[]" }
      ], { lastUpload: "2026-10-03T10:00:00.000Z" });
      expect((await store.ReadMetadata()).files).to.deep.equal([
        "keybindings.json", "keybindingsMac.json", "settings.json"
      ]);

      // A removed retained file must not leave a phantom manifest entry.
      await fs.remove(path.join(folder, "keybindingsMac.json"));
      await store.Write([{ name: "settings.json", content: "{}" }], {
        lastUpload: "2026-10-04T10:00:00.000Z"
      });
      expect((await store.ReadMetadata()).files).to.deep.equal([
        "keybindings.json", "settings.json"
      ]);
    });

    it("reports changes against the folder content", async () => {
      const store = new FolderStore(folder);
      const files = [{ name: "settings.json", content: "{}" }];
      expect(await store.HasChanges(files)).to.equal(true);
      await store.Write(files, { lastUpload: new Date() });
      expect(await store.HasChanges(files)).to.equal(false);
      expect(
        await store.HasChanges([{ name: "settings.json", content: "{ }" }])
      ).to.equal(true);
    });

    it("counts a file dropped since the previous export as a change", async () => {
      const store = new FolderStore(folder);
      const files = [
        { name: "settings.json", content: "{}" },
        { name: "snippets|go.json", content: "{}" },
        { name: "keybindingsMac.json", content: "[]" }
      ];
      await store.Write(files, { lastUpload: new Date() });
      const metadata = await store.ReadMetadata();
      expect(await store.HasChanges(files, metadata)).to.equal(false);
      // Another OS does not export keybindingsMac.json; that is not a change.
      expect(await store.HasChanges(files.slice(0, 2), metadata)).to.equal(
        false
      );
      expect(await store.HasChanges(files.slice(0, 1), metadata)).to.equal(
        true
      );
    });

    it("prevalidates the complete export manifest before mutating settings", async () => {
      const cases = [
        [
          { name: "settings.json", content: "new" },
          { name: METADATA_FILE, content: "reserved" }
        ],
        [
          { name: "settings.json", content: "new" },
          { name: "snippets|go.json", content: "{}" },
          { name: "snippets|go.json", content: "{ \"duplicate\": true }" }
        ],
        [
          { name: "settings.json", content: "new" },
          { name: "customized_sync|foo.json", content: "first" },
          { name: "|customized_sync|foo.json", content: "alias" }
        ]
      ];

      for (const files of cases) {
        await fs.remove(folder);
        const store = new FolderStore(folder);
        const baseline = "2026-10-01T10:00:00.000Z";
        await store.Write([{ name: "settings.json", content: "old" }], {
          lastUpload: baseline
        });

        let error: Error = null;
        try {
          await store.Write(files, {
            lastUpload: "2026-10-02T10:00:00.000Z"
          });
        } catch (err) {
          error = err;
        }

        expect(error).to.not.equal(null);
        expect(await store.ReadFile("settings.json")).to.equal("old");
        expect((await store.ReadMetadata()).lastUpload).to.equal(baseline);
        expect(await store.ReadFile("snippets|go.json")).to.equal(null);
        expect(await store.ReadFile("|customized_sync|foo.json")).to.equal(null);
      }
    });

    it("does not follow symbolic links out of the folder", async function() {
      const outside = path.join(root, "outside");
      await fs.outputFile(path.join(outside, "secret.json"), "{}");
      await fs.ensureDir(folder);
      try {
        await fs.symlink(outside, path.join(folder, "snippets"), "dir");
        await fs.symlink(
          path.join(outside, "secret.json"),
          path.join(folder, "linked.json"),
          "file"
        );
      } catch (err) {
        this.skip();
      }
      const store = new FolderStore(folder);

      expect(await store.ListFiles(filter)).to.deep.equal([]);
      expect(await store.ReadFile("linked.json")).to.equal(null);
      expect(await store.ReadFile("snippets|secret.json")).to.equal(null);
      let error: Error = null;
      try {
        await store.Write([{ name: "snippets|go.json", content: "{}" }], {
          lastUpload: new Date()
        });
      } catch (err) {
        error = err;
      }
      expect(error).to.not.equal(null);
      expect(await fs.pathExists(path.join(outside, "go.json"))).to.equal(
        false
      );
    });

    it("refuses to write while another export holds the lock", async () => {
      await fs.outputFile(path.join(folder, LOCK_FILE), "");
      let error: Error = null;
      try {
        await new FolderStore(folder).Write(
          [{ name: "settings.json", content: "{}" }],
          { lastUpload: new Date() }
        );
      } catch (err) {
        error = err;
      }
      expect(error.message).to.match(/in progress/);
      expect(await fs.pathExists(path.join(folder, "settings.json"))).to.equal(
        false
      );
      expect(await fs.pathExists(path.join(folder, LOCK_FILE))).to.equal(true);
    });

    it("takes over a lock left behind by a crashed export", async () => {
      const lock = path.join(folder, LOCK_FILE);
      await fs.outputFile(lock, "");
      const old = new Date(Date.now() - 10 * 60 * 1000);
      await fs.utimes(lock, old, old);

      await new FolderStore(folder).Write(
        [{ name: "settings.json", content: "{}" }],
        { lastUpload: new Date() }
      );

      expect(await fs.pathExists(path.join(folder, "settings.json"))).to.equal(
        true
      );
      expect(await fs.pathExists(lock)).to.equal(false);
    });

    it("renews a live export lease so another writer cannot treat it as stale", async () => {
      await fs.ensureDir(folder);
      const lock = path.join(folder, LOCK_FILE);
      const store: any = new FolderStore(folder);
      const lease = await store.Lock(await fs.realpath(folder));
      try {
        const stale = new Date(Date.now() - 10 * 60 * 1000);
        await fs.utimes(lock, stale, stale);
        await lease.renew();
        const refreshed = await fs.stat(lock);
        expect(Date.now() - refreshed.mtimeMs).to.be.lessThan(5000);

        let error: Error = null;
        try {
          await new FolderStore(folder).Write(
            [{ name: "settings.json", content: "{}" }],
            { lastUpload: new Date() }
          );
        } catch (err) {
          error = err;
        }
        expect(error).to.not.equal(null);
        expect(error.message).to.match(/in progress/);
      } finally {
        await lease.release();
      }
      expect(await fs.pathExists(lock)).to.equal(false);
    });

    it("aborts after takeover and does not delete the successor export lock", async () => {
      const store: any = new FolderStore(folder);
      const originalWrite = store.WriteAtomic.bind(store);
      const lock = path.join(folder, LOCK_FILE);
      const successor = "successor-export-owner";
      let tookOver = false;
      store.WriteAtomic = async (
        root: string,
        relative: string,
        content: string,
        assertOwned: () => Promise<void>
      ) => {
        if (!tookOver) {
          tookOver = true;
          await fs.remove(lock);
          await fs.outputFile(lock, successor);
        }
        await originalWrite(root, relative, content, assertOwned);
      };

      let error: Error = null;
      try {
        await store.Write(
          [{ name: "settings.json", content: "{}" }],
          { lastUpload: new Date() }
        );
      } catch (err) {
        error = err;
      }
      expect(error).to.not.equal(null);
      expect(error.message).to.match(/lock ownership was lost/);
      expect(await fs.readFile(lock, "utf8")).to.equal(successor);
      expect(await fs.pathExists(path.join(folder, METADATA_FILE))).to.equal(false);
    });

    it("refuses late rename when export lease is lost during temporary write", async () => {
      await fs.outputFile(path.join(folder, "settings.json"), "newer exporter");
      const store: any = new FolderStore(folder);
      let checks = 0;
      let error: Error = null;
      try {
        await store.WriteAtomic(
          await fs.realpath(folder),
          "settings.json",
          "stale old exporter",
          async () => {
            checks += 1;
            throw new Error("Sync: Export lock ownership was lost");
          }
        );
      } catch (err) {
        error = err;
      }
      expect(checks).to.equal(1);
      expect(error).to.not.equal(null);
      expect(error.message).to.match(/ownership was lost/);
      expect(await fs.readFile(path.join(folder, "settings.json"), "utf8")).to.equal(
        "newer exporter"
      );
      // A rejected writer must not leave its candidate temporary artifact.
      expect((await fs.readdir(folder)).sort()).to.deep.equal(["settings.json"]);
    });

    it("refuses to replace an export that arrived after it was read", async () => {
      const store = new FolderStore(folder);
      await store.Write([{ name: "settings.json", content: "1" }], {
        lastUpload: "2026-10-01T10:00:00.000Z"
      });
      const seen = await store.ReadMetadata();
      // Another machine exports in the meantime.
      await store.Write([{ name: "settings.json", content: "2" }], {
        lastUpload: "2026-10-01T11:00:00.000Z"
      });

      let error: Error = null;
      try {
        await store.Write(
          [{ name: "settings.json", content: "3" }],
          { lastUpload: "2026-10-01T12:00:00.000Z" },
          seen
        );
      } catch (err) {
        error = err;
      }
      expect(error.message).to.match(/during this export/);
      expect(await store.ReadFile("settings.json")).to.equal("2");
      expect(await fs.pathExists(path.join(folder, LOCK_FILE))).to.equal(false);

      await store.Write(
        [{ name: "settings.json", content: "3" }],
        { lastUpload: "2026-10-01T12:00:00.000Z" },
        await store.ReadMetadata()
      );
      expect(await store.ReadFile("settings.json")).to.equal("3");
    });

    it("rejects a metadata file that is not JSON", async () => {
      await fs.outputFile(path.join(folder, METADATA_FILE), "not json");
      let error: Error = null;
      try {
        await new FolderStore(folder).ReadMetadata();
      } catch (err) {
        error = err;
      }
      expect(error.message).to.match(/not valid JSON/);
    });

    it("lists nothing for a folder that does not exist yet", async () => {
      expect(await new FolderStore(folder).ListFiles(filter)).to.deep.equal([]);
      expect(await new FolderStore(folder).ReadMetadata()).to.equal(null);
    });
  });
});
