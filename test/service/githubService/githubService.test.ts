import { expect } from "chai";

import { File } from "../../../src/service/file.service";
import { GitHubService } from "../../../src/service/github.service";

describe("GitHubService", () => {
  it("should update only changed files", () => {
    const github: GitHubService = Object.create(GitHubService.prototype);
    const gistObject = {
      data: {
        files: {
          "extensions.json": {
            content: "unchanged"
          },
          "settings.json": {
            content: "old"
          }
        }
      }
    };

    const actual = github.UpdateChangedFiles(
      gistObject,
      [new File("settings.json", "new", "", "settings.json")],
      []
    );

    expect(actual.data.files).to.deep.equals({
      "settings.json": {
        content: "new"
      }
    });
  });

  it("should preserve explicit gist deletions", () => {
    const github: GitHubService = Object.create(GitHubService.prototype);
    const gistObject = {
      data: {
        files: {
          "extensions.json": {
            content: "old"
          },
          "settings.json": {
            content: "old"
          }
        }
      }
    };

    const actual = github.UpdateChangedFiles(
      gistObject,
      [new File("settings.json", "new", "", "settings.json")],
      ["extensions.json"]
    );

    expect(actual.data.files).to.deep.equals({
      "extensions.json": null,
      "settings.json": {
        content: "new"
      }
    });
  });
});
