import { expect } from "chai";
import { execFileSync } from "child_process";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import {
  gistNameToRepoPath,
  GitRepoService,
  IRepoFile,
  PushRejectedError,
  repoPathToGistName,
  stripCredentials,
  validateBranchName
} from "../../../src/service/git.service";

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"]);
    return true;
  } catch (err) {
    return false;
  }
}

function toFiles(contents: { [gistName: string]: string }): IRepoFile[] {
  return Object.keys(contents).map(gistName => ({
    gistName,
    content: contents[gistName]
  }));
}

function toRemoteShape(contents: { [gistName: string]: string }) {
  const expected = {};
  Object.keys(contents).forEach(gistName => {
    expected[gistName] = { content: contents[gistName] };
  });
  return expected;
}

describe("git.service path mapping", () => {
  it("should map gist names to repository paths and back", () => {
    const names = [
      "settings.json",
      "snippets|a.json",
      "snippets|my snippet ü.code-snippets",
      "|customized_sync|.htmlhintrc",
      "cloudSettings"
    ];
    const paths = [
      "settings.json",
      "snippets/a.json",
      "snippets/my snippet ü.code-snippets",
      "customized_sync/.htmlhintrc",
      "cloudSettings"
    ];
    names.forEach((name, index) => {
      expect(gistNameToRepoPath(name)).to.equal(paths[index]);
      expect(repoPathToGistName(paths[index])).to.equal(name);
    });
  });

  it("should reject unsafe paths", () => {
    expect(() => gistNameToRepoPath("..|settings.json")).to.throw();
    expect(() => gistNameToRepoPath("snippets|..|..|x.json")).to.throw();
    expect(() => gistNameToRepoPath(".git|config")).to.throw();
    expect(() => gistNameToRepoPath("|customized_sync|..")).to.throw();
    expect(() => gistNameToRepoPath("")).to.throw();
    expect(repoPathToGistName("../x.json")).to.equal(null);
    expect(repoPathToGistName("a/../x.json")).to.equal(null);
    expect(repoPathToGistName(".git/config")).to.equal(null);
    expect(repoPathToGistName("/etc/passwd")).to.equal(null);
    expect(repoPathToGistName("a\\b.json")).to.equal(null);
    expect(repoPathToGistName("C:/x.json")).to.equal(null);
  });

  it("should validate branch names", () => {
    ["master", "office", "feature/home-pc", "v1.0"].forEach(branch => {
      expect(() => validateBranchName(branch)).to.not.throw();
    });
    ["", "-x", "a b", "a..b", "x.lock", "a/", "a@{b", "a:b", "/a"].forEach(
      branch => {
        expect(() => validateBranchName(branch)).to.throw();
      }
    );
  });

  it("should strip credentials from urls", () => {
    expect(stripCredentials("https://user:secret@github.com/a/b.git")).to.equal(
      "https://github.com/a/b.git"
    );
    expect(stripCredentials("https://github.com/a/b.git")).to.equal(
      "https://github.com/a/b.git"
    );
    expect(stripCredentials("git@github.com:a/b.git")).to.equal(
      "git@github.com:a/b.git"
    );
  });
});

describe("GitRepoService", function() {
  this.timeout(60000);

  let root: string;
  let remote: string;

  before(function() {
    if (!gitAvailable()) {
      this.skip();
    }
  });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sync tëst "));
    remote = path.join(root, "remote repo ü.git");
    execFileSync("git", ["init", "--bare", remote]);
  });

  afterEach(() => {
    fs.removeSync(root);
  });

  function service(name: string, branch: string = "master") {
    return new GitRepoService({
      repoDir: path.join(root, name, "local clone ü"),
      remoteUrl: remote,
      branch
    });
  }

  async function upload(
    repo: GitRepoService,
    contents: { [gistName: string]: string }
  ) {
    await repo.ensureRepo();
    await repo.syncFromRemote();
    return repo.commitAndPush(toFiles(contents), "test upload");
  }

  async function download(repo: GitRepoService) {
    await repo.ensureRepo();
    if (!(await repo.syncFromRemote())) {
      return null;
    }
    return repo.readFiles();
  }

  function commitCount(branch: string): number {
    return Number(
      execFileSync("git", ["-C", remote, "rev-list", "--count", branch])
        .toString()
        .trim()
    );
  }

  it("should round trip files between two machines", async () => {
    const contents = {
      "settings.json": '{\n  "editor.fontSize": 14\n}',
      "snippets|my snippet ü.code-snippets": "{}",
      "|customized_sync|.htmlhintrc": '{ "a": true }',
      "extensions.json": "[]",
      cloudSettings: '{"lastUpload":"2019-01-01T00:00:00.000Z"}'
    };
    expect(await upload(service("a"), contents)).to.equal("pushed");
    expect(await download(service("b"))).to.deep.equal(
      toRemoteShape(contents)
    );
  });

  it("should report a missing branch on download", async () => {
    expect(await download(service("a"))).to.equal(null);
    await upload(service("a"), { "settings.json": "{}" });
    expect(await download(service("b", "office"))).to.equal(null);
  });

  it("should keep one content per branch", async () => {
    const master = { "settings.json": '{"profile":"master"}' };
    const office = {
      "settings.json": '{"profile":"office"}',
      "keybindings.json": "[]"
    };
    // the same local clone is used to switch between branches
    await upload(service("a", "master"), master);
    await upload(service("a", "office"), office);
    expect(await download(service("b", "master"))).to.deep.equal(
      toRemoteShape(master)
    );
    expect(await download(service("b", "office"))).to.deep.equal(
      toRemoteShape(office)
    );
    // switching back to master in the same clone gives master only
    expect(await download(service("a", "master"))).to.deep.equal(
      toRemoteShape(master)
    );
  });

  it("should remove files and keep the history", async () => {
    await upload(service("a"), { "a.json": "1", "b.json": "1" });
    await upload(service("a"), { "a.json": "2" });
    expect(await download(service("b"))).to.deep.equal(
      toRemoteShape({ "a.json": "2" })
    );
    expect(commitCount("master")).to.equal(2);
  });

  it("should not commit when nothing changed", async () => {
    await upload(service("a"), { "a.json": "1" });
    expect(await upload(service("a"), { "a.json": "1" })).to.equal(
      "unchanged"
    );
    expect(commitCount("master")).to.equal(1);
  });

  it("should keep README files that are not managed by the extension", async () => {
    await upload(service("a"), { "README.md": "docs", "a.json": "1" });
    await upload(service("a"), { "a.json": "2" });
    const files = await download(service("b"));
    expect(Object.keys(files).sort()).to.deep.equal(["README.md", "a.json"]);
  });

  it("should reject a push when the remote branch changed meanwhile", async () => {
    await upload(service("a"), { "a.json": "1" });

    const slow = service("slow");
    await slow.ensureRepo();
    await slow.syncFromRemote();

    await upload(service("fast"), { "a.json": "from fast" });

    let error: Error = null;
    try {
      await slow.commitAndPush(toFiles({ "a.json": "from slow" }), "slow");
    } catch (err) {
      error = err;
    }
    expect(error).to.be.instanceOf(PushRejectedError);
    expect(await download(service("b"))).to.deep.equal(
      toRemoteShape({ "a.json": "from fast" })
    );
  });

  it("should never store the token in the repository config", async () => {
    const token = "ghp_supersecrettoken123";
    const repo = new GitRepoService({
      repoDir: path.join(root, "token clone"),
      remoteUrl: "https://example.invalid/user/settings.git",
      branch: "master",
      token
    });
    await repo.ensureRepo();
    const config = fs.readFileSync(
      path.join(root, "token clone", ".git", "config"),
      "utf8"
    );
    expect(config).to.contain("https://example.invalid/user/settings.git");
    expect(config).to.not.contain(token);
    expect(config).to.not.contain(
      Buffer.from("x-access-token:" + token).toString("base64")
    );
  });

  it("should reject unsafe remote urls and branches", () => {
    const options = { repoDir: root, remoteUrl: remote, branch: "master" };
    expect(
      () => new GitRepoService({ ...options, remoteUrl: "--upload-pack=x" })
    ).to.throw();
    expect(
      () => new GitRepoService({ ...options, remoteUrl: "ext::sh -c id" })
    ).to.throw();
    expect(
      () => new GitRepoService({ ...options, branch: "--force" })
    ).to.throw();
  });
});
