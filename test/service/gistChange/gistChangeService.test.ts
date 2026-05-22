import { expect } from "chai";

import { File } from "../../../src/service/file.service";
import { GistChangeService } from "../../../src/service/gistChange.service";

describe("GistChangeService", () => {
  const unchanged = new File("settings.json", "same", "", "settings.json");
  const changed = new File("keybindings.json", "new", "", "keybindings.json");
  const created = new File("snippets|demo.json", "created", "", "snippets|demo.json");
  const cloudSettings = new File("cloudSettings", "metadata", "", "cloudSettings");
  const allFiles = [unchanged, changed, created, cloudSettings];
  const gistFiles = {
    "settings.json": { content: "same" },
    "keybindings.json": { content: "old" }
  };

  it("returns only new and changed setting files", () => {
    const result = GistChangeService.GetChangedSettingFiles(allFiles, gistFiles);

    expect(result.map(file => file.gistName)).to.deep.equal([
      "keybindings.json",
      "snippets|demo.json"
    ]);
  });

  it("uploads changed files and cloud settings during normal upload", () => {
    const result = GistChangeService.GetFilesToUpload(allFiles, gistFiles, false);

    expect(result.map(file => file.gistName)).to.deep.equal([
      "keybindings.json",
      "snippets|demo.json",
      "cloudSettings"
    ]);
  });

  it("uploads all files during forced upload", () => {
    const result = GistChangeService.GetFilesToUpload(allFiles, gistFiles, true);

    expect(result.map(file => file.gistName)).to.deep.equal([
      "settings.json",
      "keybindings.json",
      "snippets|demo.json",
      "cloudSettings"
    ]);
  });
});
