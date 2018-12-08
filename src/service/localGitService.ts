"use strict";

import * as git from "simple-git/promise";
import { File } from "./fileService";

export class LocalGitService {
  private git: git.SimpleGit = null;

  constructor(userPath: string) {
    this.git = git(userPath);
  }

  public async Init(remoteUrl: string): Promise<void> {
    await this._setupGit();
    await this._setupRemote(remoteUrl);
  }

  public async Add(files: File[]): Promise<void> {
    await this.git.add(files.map(file => file.filePath));
  }

  public async Commit(message: string): Promise<void> {
    await this.git.commit(message);
  }

  public async Push(): Promise<void> {
    await this.git.push("origin", "master", {
      "--set-upstream": null,
      "--force": null
    });
  }

  public async Pull(): Promise<void> {
    await this.git.checkout(["-B", "master", "origin/master"]);
  }

  public async Files(): Promise<string[]> {
    return await this.git
      .raw(["ls-tree", "--full-tree", "--name-only", "-r", "HEAD"])
      .then(result => result.split(/\r\n|\r|\n/));
  }

  private async _setupGit(): Promise<void> {
    if (!(await this.git.checkIsRepo())) {
      await this.git.init();
    }
  }

  private async _setupRemote(remoteUrl: string): Promise<void> {
    if (remoteUrl) {
      const remote = await this.git
        .getRemotes(true)
        .then(remotes => remotes.filter(v => v.name === "origin").shift());
      if (remote) {
        if (remote.refs.push === remoteUrl) {
          return;
        }
        await this.git.removeRemote("origin");
      }
      await this.git.addRemote("origin", remoteUrl);
    }
  }
}
