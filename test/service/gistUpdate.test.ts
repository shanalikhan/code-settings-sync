import { expect } from "chai";

import {
  buildGistPatchFiles,
  GistSyncFile,
  planGistUpdate
} from "../../src/service/gistUpdate";

describe("gistUpdate", () => {
  it("should include only changed and new files plus remote-only deletions", () => {
    const localFiles: GistSyncFile[] = [
      { gistName: "settings.json", content: '{ "editor.fontSize": 14 }' },
      { gistName: "extensions.json", content: '["ms-python.python"]' },
      {
        gistName: "cloudSettings",
        content: '{"lastUpload":"2026-05-23T00:00:00.000Z"}'
      }
    ];

    const plan = planGistUpdate(
      {
        "settings.json": { content: '{ "editor.fontSize": 12 }' },
        "extensions.json": { content: '["ms-python.python"]' },
        "locale.json": { content: '{ "locale": "en" }' },
        cloudSettings: { content: '{"lastUpload":"2026-05-22T00:00:00.000Z"}' }
      },
      localFiles
    );

    expect(plan.changedFiles.map(file => file.gistName)).to.deep.equal([
      "settings.json",
      "cloudSettings"
    ]);
    expect(plan.deletedFileNames).to.deep.equal(["locale.json"]);
  });

  it("should preserve remote keybindings variants when they are absent locally", () => {
    const localFiles: GistSyncFile[] = [
      { gistName: "settings.json", content: "{}" },
      {
        gistName: "cloudSettings",
        content: '{"lastUpload":"2026-05-23T00:00:00.000Z"}'
      }
    ];

    const plan = planGistUpdate(
      {
        "settings.json": { content: "{}" },
        "keybindingsMac.json": { content: "[]" },
        "keybindingsLinux.json": { content: "[]" },
        cloudSettings: { content: '{"lastUpload":"2026-05-22T00:00:00.000Z"}' }
      },
      localFiles
    );

    expect(plan.changedFiles.map(file => file.gistName)).to.deep.equal([
      "cloudSettings"
    ]);
    expect(plan.deletedFileNames).to.deep.equal([]);
  });

  it("should build a patch payload with only changed and deleted gist entries", () => {
    const gistPatchFiles = buildGistPatchFiles(
      [
        { gistName: "settings.json", content: '{ "editor.fontSize": 14 }' },
        {
          gistName: "cloudSettings",
          content: '{"lastUpload":"2026-05-23T00:00:00.000Z"}'
        }
      ],
      ["locale.json"]
    );

    expect(gistPatchFiles).to.deep.equal({
      "settings.json": {
        content: '{ "editor.fontSize": 14 }'
      },
      cloudSettings: {
        content: '{"lastUpload":"2026-05-23T00:00:00.000Z"}'
      },
      "locale.json": null
    });
    expect(gistPatchFiles).to.not.have.property("extensions.json");
  });
});
