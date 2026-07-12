import { expect } from "chai";

import {
  IGistChangePlan,
  GistChangeService
} from "../../../src/service/gist-change.service";
import { File } from "../../../src/service/file.service";

function settingFile(gistName: string, content: string): File {
  return new File(gistName, content, "", gistName);
}

describe("GistChangeService", () => {
  it("plans only changed files and remote deletions", () => {
    const plan = GistChangeService.CreatePlan(
      {
        "extensions.json": { content: "old" },
        "keybindings.json": { content: "keep" },
        "launch.json": { content: "same" },
        "old-snippet.code-snippets": { content: "stale" },
        "settings.json": { content: "old" }
      },
      [
        settingFile("extensions.json", "old"),
        settingFile("launch.json", "same"),
        settingFile("settings.json", "new"),
        settingFile("tasks.json", "created"),
        settingFile("cloudSettings", "stamp")
      ]
    );

    expect(plan.hasChanges).to.equal(true);
    expect(plan.changes).to.deep.equal([
      { action: "updated", fileName: "settings.json" },
      { action: "created", fileName: "tasks.json" },
      { action: "deleted", fileName: "old-snippet.code-snippets" }
    ]);
    expect(plan.filesToUpload.map(file => file.gistName)).to.deep.equal([
      "settings.json",
      "tasks.json",
      "cloudSettings"
    ]);

    const patchFiles = GistChangeService.CreatePatchFiles(plan);
    expect(patchFiles).to.deep.equal({
      "old-snippet.code-snippets": null,
      "settings.json": { content: "new" },
      "tasks.json": { content: "created" },
      cloudSettings: { content: "stamp" }
    });
  });

  it("preserves remote keybinding variants that are not local on this platform", () => {
    const plan = GistChangeService.CreatePlan(
      {
        "keybindings.json": { content: "default" },
        "keybindingsMac.json": { content: "mac" },
        "linux-only.json": { content: "remove" }
      },
      [
        settingFile("settings.json", "{}"),
        settingFile("cloudSettings", "stamp")
      ]
    );

    expect(plan.filesToDelete).to.deep.equal(["linux-only.json"]);
    expect(plan.changes).to.deep.equal([
      { action: "created", fileName: "settings.json" },
      { action: "deleted", fileName: "linux-only.json" }
    ]);
  });

  it("builds a full file patch during forced upload", () => {
    const plan: IGistChangePlan = GistChangeService.CreatePlan(
      {
        "extensions.json": { content: "same" },
        "settings.json": { content: "same" }
      },
      [
        settingFile("extensions.json", "same"),
        settingFile("settings.json", "same"),
        settingFile("cloudSettings", "stamp")
      ],
      true
    );

    expect(plan.hasChanges).to.equal(false);
    expect(plan.filesToUpload.map(file => file.gistName)).to.deep.equal([
      "extensions.json",
      "settings.json",
      "cloudSettings"
    ]);
    expect(GistChangeService.CreatePatchFiles(plan)).to.deep.equal({
      "extensions.json": { content: "same" },
      "settings.json": { content: "same" },
      cloudSettings: { content: "stamp" }
    });
  });

  it("formats the upload preview from the same change plan", () => {
    const plan = GistChangeService.CreatePlan(
      {
        "settings.json": { content: "old" },
        "stale.json": { content: "remove" }
      },
      [
        settingFile("settings.json", "new"),
        settingFile("tasks.json", "created"),
        settingFile("cloudSettings", "stamp")
      ]
    );

    expect(GistChangeService.FormatChangeSummary(plan)).to.equal(
      [
        "Sync: The following local changes will be uploaded.",
        "New: tasks.json",
        "Changed: settings.json",
        "Deleted: stale.json"
      ].join("\n")
    );
  });
});
