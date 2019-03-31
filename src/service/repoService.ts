import { existsSync, writeFileSync } from "fs-extra";
import * as Git from "simple-git/promise";
import * as vscode from "vscode";
import localize from "../localize";

export class RepoService {
  public git: Git.SimpleGit;
  constructor(
    private options: {
      workingDirectory: string;
      repoURL: string;
      ignored: string[];
    }
  ) {
    this.git = Git(this.options.workingDirectory).silent(true);
    this.checkRepo();
  }

  public async checkRepo() {
    const isRepo = await this.git.checkIsRepo();
    const gitignorePath = `${this.options.workingDirectory}/.gitignore`;
    if (!isRepo) {
      await this.initRepo();
    }
    if (!existsSync(gitignorePath)) {
      this.updateGitignore(gitignorePath);
    }
    return true;
  }

  public async initRepo() {
    await this.git.init();
    await this.git.addRemote("origin", this.options.repoURL);
    return true;
  }

  public async pull() {
    await this.git.pull();
    return true;
  }

  public async push() {
    if ((await this.git.diff()) === "") {
      vscode.window.setStatusBarMessage(
        localize("cmd.updateSettings.info.noChanges"),
        2000
      );
      return false;
    }
    await this.git.add(".");
    await this.git.commit("Update settings");
    await this.git.push(this.options.repoURL, "master");
    return true;
  }

  public async updateGitignore(path: string) {
    let str = "";
    this.options.ignored.forEach(async item => (str = str + item + "\n"));
    writeFileSync(path, str);
    return true;
  }
}
