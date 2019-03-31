
"use strict";

import { File } from "./fileService";
import * as simplegit from "simple-git/promise";

export class GitService {
  public git: simplegit.SimpleGit = null;

  public static sshRegex: RegExp = /(^)git@(github|gitlab).com:[a-zA-Z0-9]+\/([a-zA-Z0-9\-]+).git($)/;
  public static httpsRegex: RegExp = /(^)https:\/\/(www.)?(github|gitlab).com\/[a-zA-Z0-9]+\/([a-zA-Z0-9\-]+).git($)/;
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

  public async initialize(): Promise<void> {
    // Simple git has a built in error checking so we have to
    // catch it first before throwing to use our own error check
    return this.git.init().catch((err: Error) => { throw err; });
  }

  public async addFile(file: File): Promise<void> {
    return this.git.add(file.filePath);
  }

  public static async ParseService(repoUrl: string, regexPos: number = 3): Promise<string> {
    const matchedString: string[] =
      repoUrl.match(this.httpsRegex) || repoUrl.match(this.sshRegex);
    if (!matchedString) {
      return Promise.resolve(null);
    }
    // -2 is reponame
    // -3 is service name
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
