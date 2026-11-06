"use strict";

const assert = require("assert").strict;
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const Module = require("module");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "settings-sync-write-"));
  const filename = path.join(root, "settings.json");
  let content = "before";
  let saves = 0;
  let mode;
  const document = {
    uri: { scheme: "file", fsPath: filename },
    isDirty: false,
    positionAt: offset => offset,
    getText: () => content,
    save: async () => {
      saves++;
      return false;
    }
  };
  const api = {
    Range: class {
      constructor(start, end) {
        this.start = start;
        this.end = end;
      }
    },
    WorkspaceEdit: class {
      replace(uri, range, text) {
        this.text = text;
      }
    },
    workspace: {
      textDocuments: [document],
      applyEdit: async edit => {
        if (mode === "cancel") return false;
        content = edit.text + (mode === "concurrent" ? " user edit" : "");
        document.isDirty = true;
        return true;
      }
    }
  };
  const load = Module._load;
  Module._load = function(name, parent, main) {
    return name === "vscode" ? api : load.call(this, name, parent, main);
  };
  const log = console.error;
  try {
    const { FileService } = require("../out/src/service/file.service");
    console.error = () => {};
    for (mode of ["cancel", "save-refused", "concurrent"]) {
      await fs.writeFile(filename, "before");
      content = "before";
      document.isDirty = false;
      saves = 0;
      assert.equal(await FileService.WriteFile(filename, "downloaded"), false);
      assert.equal(await fs.readFile(filename, "utf8"), "before");
      assert.equal(saves, mode === "save-refused" ? 1 : 0);
      if (mode === "concurrent") assert.equal(content, "downloaded user edit");
      console.log("PASS " + mode);
    }
  } finally {
    Module._load = load;
    console.error = log;
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("settings-sync-write-"));
    await require("fs-extra").remove(root);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
