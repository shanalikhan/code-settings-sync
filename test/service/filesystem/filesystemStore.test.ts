import { strict as assert } from "assert";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join, resolve } from "path";
import { FileSystemStore } from "../../../src/service/filesystem/filesystemStore";

describe("FileSystemStore", () => {
  let folder: string;
  beforeEach(async () => {
    folder = await fs.mkdtemp(join(tmpdir(), "settings-sync-test-"));
  });
  afterEach(async () => {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert.ok(basename(folder).startsWith("settings-sync-test-"));
    const extra = await import("fs-extra");
    await extra.remove(folder);
  });

  it("round trips a bundle on disk and replaces old contents", async () => {
    const store = new FileSystemStore(folder, true);
    const initial = await store.ReadGist("");
    const updated = store.UpdateGIST(initial, [
      { gistName: "settings.json", content: '{"test":true}' },
      { gistName: "snippets|sample.json", content: "{}" }
    ]);
    assert.equal(await store.SaveGIST(updated.data), true);
    const read = await new FileSystemStore(folder).ReadGist("");
    assert.equal(read.data.files["settings.json"].content, '{"test":true}');
    const next = store.UpdateGIST(read, [
      { gistName: "settings.json", content: "{}" }
    ]);
    await store.SaveGIST(next.data);
    assert.equal(
      (await store.ReadGist("")).data.files["snippets|sample.json"],
      undefined
    );
    assert.deepEqual((await fs.readdir(folder)).sort(), ["settings-sync.json"]);
  });

  it("rejects missing imports and leaves prior contents intact on invalid exports", async () => {
    const store = new FileSystemStore(folder);
    await assert.rejects(store.ReadGist(""), /ENOENT/);
    await fs.writeFile(join(folder, "settings-sync.json"), "previous");
    assert.throws(() =>
      store.UpdateGIST({ data: { files: {} } }, [
        { gistName: "snippets|..|outside.json", content: "unsafe" }
      ])
    );
    assert.equal(
      await fs.readFile(join(folder, "settings-sync.json"), "utf8"),
      "previous"
    );
  });

  it("rejects unsafe bundles before returning any imported files", async () => {
    for (const key of [
      "../outside.json",
      "snippets|..|x.json",
      "syncLocalSettings.json",
      "__proto__",
      "NUL.json"
    ]) {
      const files = Object.create(null);
      files[key] = { content: "unsafe" };
      await fs.writeFile(
        join(folder, "settings-sync.json"),
        JSON.stringify({
          version: 1,
          files
        })
      );
      await assert.rejects(new FileSystemStore(folder).ReadGist(""));
    }
  });

  it("refuses concurrent writes without stealing another writer's lock", async () => {
    const lock = join(folder, "settings-sync.json.lock");
    await fs.writeFile(lock, "test lock", { flag: "wx" });
    await assert.rejects(
      new FileSystemStore(folder).SaveGIST({ files: {} }),
      /EEXIST/
    );
    assert.equal(await fs.readFile(lock, "utf8"), "test lock");
  });

  it("keeps the previous bundle and cleans owned files when atomic rename fails", async () => {
    const filename = join(folder, "settings-sync.json");
    await fs.writeFile(filename, "previous");
    const rename = fs.rename;
    fs.rename = async () => {
      throw new Error("simulated rename failure");
    };
    try {
      await assert.rejects(
        new FileSystemStore(folder).SaveGIST({ files: {} }),
        /rename failure/
      );
    } finally {
      fs.rename = rename;
    }
    assert.equal(await fs.readFile(filename, "utf8"), "previous");
    assert.deepEqual(await fs.readdir(folder), ["settings-sync.json"]);
  });

  it("rejects unsupported versions and invalid content types", async () => {
    for (const bundle of [
      null,
      {},
      { version: 2, files: {} },
      { version: 1, files: [] },
      { version: 1, files: { "settings.json": { content: 42 } } }
    ]) {
      await fs.writeFile(
        join(folder, "settings-sync.json"),
        JSON.stringify(bundle)
      );
      await assert.rejects(new FileSystemStore(folder).ReadGist(""));
    }
  });

  it("rejects oversized bundles before loading their content", async () => {
    const file = await fs.open(join(folder, "settings-sync.json"), "w");
    try {
      await file.truncate(64 * 1024 * 1024 + 1);
    } finally {
      await file.close();
    }
    await assert.rejects(new FileSystemStore(folder).ReadGist(""), /too large/);
  });

  it("does not follow or overwrite a bundle symlink", async function() {
    const target = join(folder, "target.json");
    await fs.writeFile(target, "untouched");
    try {
      await fs.symlink(target, join(folder, "settings-sync.json"), "file");
    } catch (error) {
      if (error.code === "EPERM") {
        this.skip();
        return;
      }
      throw error;
    }
    const store = new FileSystemStore(folder);
    await assert.rejects(store.ReadGist(""), /regular file/);
    await assert.rejects(store.SaveGIST({ files: {} }), /regular file/);
    assert.equal(await fs.readFile(target, "utf8"), "untouched");
    assert.ok(
      !(await fs.readdir(folder)).some(
        file => file.endsWith(".lock") || file.endsWith(".tmp")
      )
    );
  });
});
