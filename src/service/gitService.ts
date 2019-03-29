
"use strict";

import { File } from "./fileService";
import * as simplegit from "simple-git/promise";

export class GitService {
  public git: simplegit.SimpleGit = null;

  public static sshRegex: RegExp = /(^)git@(github|gitlab).com:[a-zA-Z0-9]+\/[a-zA-Z0-9\-]+.git($)/;
  public static httpsRegex: RegExp = /(^)https:\/\/(www.)?(github|gitlab).com\/[a-zA-Z0-9]+\/[a-zA-Z0-9\-]+.git($)/;

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

  public static async ParseService(repoUrl: string): Promise<string> {
    const matchedString: string[] =
      repoUrl.match(this.httpsRegex) || repoUrl.match(this.sshRegex);
    if (!matchedString) {
      return Promise.resolve(null);
    }
    // The 2nd to last group in the regex is specifies which service we are using
    // Guaranteed to be either github or gitlab as regex must match to get here
    return Promise.resolve(matchedString[matchedString.length - 2]);
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
