
"use strict";

import { File } from "./fileService";
import * as simplegit from "simple-git/promise";
import { RemoteWithRefs } from "simple-git/typings/response";

export enum UrlInfo {
  NAME    = 2,
  OWNER   = 3,
  SERVICE = 4,
};

export class GitService {
  public remoteUrl: string = null;
  public git: simplegit.SimpleGit = null;

  public static sshRegex: RegExp = /(^)git@(github|gitlab).com:([a-zA-Z0-9]+)\/([a-zA-Z0-9\-]+).git($)/;
  public static httpsRegex: RegExp = /(^)https:\/\/(www.)?(github|gitlab).com\/([a-zA-Z0-9]+)\/([a-zA-Z0-9\-]+).git($)/;
  public static servicesInfo: any = {
    "github": {
      id: "GitHub Repo",
      tokenUrl: "https://github.com/settings/tokens",
    },
    "gitlab": {
      id: "GitLab Repo",
      tokenUrl: "https://gitlab.com/profile/personal_access_tokens"
    }
  };

  constructor (workspace: string) {
    this.git = simplegit(workspace);
  }

  public async initialize(repoUrl: string): Promise<boolean> {
    await this.git.init();
    if (repoUrl) {
      this.remoteUrl = repoUrl;
      const remote: RemoteWithRefs = await this.getOrigin();
      if (!remote) {
        await this.git.addRemote("origin", this.remoteUrl);
      } else if (remote.refs.push !== this.remoteUrl) {
        await this.git.raw(['remote', 'set-url', 'origin', this.remoteUrl]);
      }
      const updatedOrigin: RemoteWithRefs = await this.getOrigin();
      return Promise.resolve(updatedOrigin && updatedOrigin.refs.push === this.remoteUrl);
    }
    return Promise.resolve(false);
  }

  public async addFile(file: File): Promise<void> {
    return this.git.add(file.filePath);
  }

  public async getOrigin(): Promise<RemoteWithRefs> {
    return this.git.getRemotes(true).then(remotes => remotes.filter(v => v.name === "origin").shift());
  }

  public static async ParseUrl(repoUrl: string, regexPos: UrlInfo = UrlInfo.SERVICE): Promise<string> {
    const matchedString: string[] =
      repoUrl.match(this.httpsRegex) || repoUrl.match(this.sshRegex);
    if (!matchedString) {
      return Promise.resolve(null);
    }
    // -2 is reponame
    // -3 is owner name
    // -4 is service name
    // Guaranteed as regex must match to get here
    return Promise.resolve(matchedString[matchedString.length - regexPos]);
  }

  public static async GetServiceId(repoService: string): Promise<string> {
    return Promise.resolve(this.servicesInfo[repoService].id);
  }

  public static async GetTokenUrl(repoService: string): Promise<string> {
    return Promise.resolve(this.servicesInfo[repoService].tokenUrl);
  }

  public static CheckValidRepoUrl(repoUrl: string): boolean {
    return this.sshRegex.test(repoUrl) || this.httpsRegex.test(repoUrl);
  }

  public async status () {
    let statusSummary = null;
    try {
      statusSummary = await this.git.status();
    } catch (e) {
      console.error(e);
    }
    return statusSummary;
  }
}
