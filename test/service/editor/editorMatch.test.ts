import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { HasDirtyDocument } from "../../../src/service/editorMatch";

describe("HasDirtyDocument", () => {
  const target = path.join(__dirname, "settings.json");

  it("returns true when an editor for the file has unsaved changes", () => {
    expect(
      HasDirtyDocument([{ fileName: target, isDirty: true }], target)
    ).to.equal(true);
  });

  it("returns false when the editor for the file is clean", () => {
    expect(
      HasDirtyDocument([{ fileName: target, isDirty: false }], target)
    ).to.equal(false);
  });

  it("ignores dirty editors for other files", () => {
    const other = path.join(__dirname, "keybindings.json");
    expect(
      HasDirtyDocument([{ fileName: other, isDirty: true }], target)
    ).to.equal(false);
  });

  it("matches relative and absolute spellings of the same path", () => {
    const relative = path.relative(process.cwd(), target);
    expect(
      HasDirtyDocument([{ fileName: target, isDirty: true }], relative)
    ).to.equal(true);
  });

  it("matches a dirty document opened through the real target of a symlink", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "editor-match-"));
    const realDirectory = path.join(directory, "real");
    const linkedDirectory = path.join(directory, "linked");
    fs.mkdirpSync(realDirectory);
    const realTarget = path.join(realDirectory, "settings.json");
    fs.writeFileSync(realTarget, "{}");
    fs.symlinkSync(
      realDirectory,
      linkedDirectory,
      process.platform === "win32" ? "junction" : "dir"
    );

    try {
      expect(
        HasDirtyDocument(
          [{ fileName: realTarget, isDirty: true }],
          path.join(linkedDirectory, "settings.json")
        )
      ).to.equal(true);
    } finally {
      fs.removeSync(directory);
    }
  });

  it("matches a missing file through an existing symlinked parent", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "editor-match-"));
    const realDirectory = path.join(directory, "real");
    const linkedDirectory = path.join(directory, "linked");
    fs.mkdirpSync(realDirectory);
    fs.symlinkSync(
      realDirectory,
      linkedDirectory,
      process.platform === "win32" ? "junction" : "dir"
    );
    const realTarget = path.join(realDirectory, "new-settings.json");

    try {
      expect(
        HasDirtyDocument(
          [{ fileName: realTarget, isDirty: true }],
          path.join(linkedDirectory, "new-settings.json")
        )
      ).to.equal(true);
    } finally {
      fs.removeSync(directory);
    }
  });

  it("matches a dirty document at a dangling symlink target", () => {
    // File symlink creation can require elevated Windows privileges. The bug
    // reported by #396 is reproducible on POSIX, including the reporter's Linux.
    if (process.platform === "win32") {
      return;
    }

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "editor-match-"));
    const realDirectory = path.join(directory, "real");
    const realTarget = path.join(realDirectory, "settings.json");
    const linkedTarget = path.join(directory, "settings-link.json");
    fs.mkdirpSync(realDirectory);
    fs.symlinkSync(realTarget, linkedTarget);

    try {
      expect(
        HasDirtyDocument(
          [{ fileName: realTarget, isDirty: true }],
          linkedTarget
        )
      ).to.equal(true);
    } finally {
      fs.removeSync(directory);
    }
  });

  it("returns false for an empty list of open documents", () => {
    expect(HasDirtyDocument([], target)).to.equal(false);
  });
});
