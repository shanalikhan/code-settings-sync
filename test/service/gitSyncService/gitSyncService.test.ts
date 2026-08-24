import { execFile } from "child_process";
import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { GitSyncService } from "../../../src/service/git-sync.service";

const runGit = (cwd: string, args: string[]): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });

describe("GitSyncService", () => {
  let root: string;
  let remote: string;
  let userDirectory: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "settings-sync-git-"));
    remote = path.join(root, "settings.git");
    userDirectory = path.join(root, "User");
    await fs.ensureDir(remote);
    await fs.ensureDir(userDirectory);
    await runGit(remote, ["init", "--bare"]);
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  const createService = () =>
    new GitSyncService(
      userDirectory,
      remote,
      "office",
      ["syncLocalSettings.json", "sync.lock"],
      ["workspaceStorage", ".git"]
    );

  it("commits and pushes settings without local sync metadata", async () => {
    await fs.writeJson(path.join(userDirectory, "settings.json"), {
      editor: "vim"
    });
    await fs.writeJson(path.join(userDirectory, "syncLocalSettings.json"), {
      token: "secret"
    });
    await fs.ensureDir(path.join(userDirectory, "workspaceStorage"));
    await fs.writeFile(
      path.join(userDirectory, "workspaceStorage", "state.json"),
      "private"
    );

    const result = await createService().upload();
    const checkout = path.join(root, "checkout");
    await runGit(root, ["clone", "--branch", "office", remote, checkout]);

    expect(result).to.deep.equal({ changed: true, pushed: true });
    expect(
      await fs.readJson(path.join(checkout, "settings.json"))
    ).to.deep.equal({ editor: "vim" });
    expect(
      await fs.pathExists(path.join(checkout, "syncLocalSettings.json"))
    ).to.equal(false);
    expect(
      await fs.pathExists(path.join(checkout, "workspaceStorage"))
    ).to.equal(false);
  });

  it("returns an unchanged result when there is nothing new to commit", async () => {
    await fs.writeFile(path.join(userDirectory, "settings.json"), "first");
    const service = createService();
    await service.upload();

    expect(await service.upload()).to.deep.equal({
      changed: false,
      pushed: true
    });
    expect(
      await runGit(userDirectory, ["rev-list", "--count", "HEAD"])
    ).to.equal("1");
  });

  it("forcefully downloads the configured branch and preserves ignored files", async () => {
    await fs.writeFile(path.join(userDirectory, "settings.json"), "first");
    await fs.writeFile(
      path.join(userDirectory, "syncLocalSettings.json"),
      "local-secret"
    );
    const service = createService();
    await service.upload();

    const contributor = path.join(root, "contributor");
    await runGit(root, ["clone", "--branch", "office", remote, contributor]);
    await fs.writeFile(
      path.join(contributor, "settings.json"),
      "remote-change"
    );
    await runGit(contributor, ["add", "settings.json"]);
    await runGit(contributor, [
      "-c",
      "user.name=Test User",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "Update settings"
    ]);
    await runGit(contributor, ["push", "origin", "office"]);

    await fs.writeFile(
      path.join(userDirectory, "settings.json"),
      "stale-local"
    );
    await fs.writeFile(path.join(userDirectory, "obsolete.json"), "remove-me");
    await service.download();

    expect(
      await fs.readFile(path.join(userDirectory, "settings.json"), "utf8")
    ).to.equal("remote-change");
    expect(
      await fs.readFile(
        path.join(userDirectory, "syncLocalSettings.json"),
        "utf8"
      )
    ).to.equal("local-secret");
    expect(
      await fs.pathExists(path.join(userDirectory, "obsolete.json"))
    ).to.equal(false);
  });

  it("rejects invalid branch names before changing the repository", async () => {
    const service = new GitSyncService(
      userDirectory,
      remote,
      "bad branch",
      [],
      []
    );

    let message = "";
    try {
      await service.upload();
    } catch (error) {
      message = error.message;
    }

    expect(message).to.contain("check-ref-format");
    expect(await fs.pathExists(path.join(userDirectory, ".git"))).to.equal(
      false
    );
  });
});
