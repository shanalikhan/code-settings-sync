
"use strict";

import { File } from "./fileService";
import * as simplegit from "simple-git/promise";
import { RemoteWithRefs, CommitSummary } from "simple-git/typings/response";

export enum UrlInfo {
  NAME    = 1,
  OWNER   = 2,
  SERVICE = 3,
};

export class GitService {
  public owner: string = null;
  public service: string = null;
  public repoUrl: string = null;
  public repoName: string = null;
  public forcePush: boolean = false;
  public forcePull: boolean = false;
  public branch: string = 'master';
  public git: simplegit.SimpleGit = null;

  public static sshRegex: RegExp = /^git@(github|gitlab).com:([a-zA-Z0-9]+)\/([a-zA-Z0-9\-]+).git$/;
  public static httpsRegex: RegExp = /^https:\/\/(www.)?(github|gitlab).com\/([a-zA-Z0-9]+)\/([a-zA-Z0-9\-]+).git$/;
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
  // private token: string = null;

  constructor (workspace: string) {
    this.git = simplegit(workspace);
  }

  // public async initialize(repoUrl: string, token: string, forcePush?: boolean, forcePull?: boolean): Promise<boolean> {
  public async initialize(repoUrl: string, branch?: string, forcePush?: boolean, forcePull?: boolean): Promise<boolean> {
    await this.git.init();
    if (!repoUrl) return Promise.resolve(false);
    // this.token    = token;
    this.repoUrl  = repoUrl;
    this.repoName = await GitService.ParseUrl(repoUrl, UrlInfo.NAME);
    this.owner    = await GitService.ParseUrl(repoUrl, UrlInfo.OWNER);
    this.service  = await GitService.ParseUrl(repoUrl, UrlInfo.SERVICE);

    if (branch) this.branch = branch;
    if (forcePush) this.forcePush = forcePush;
    if (forcePull) this.forcePull = forcePull;

    const remote: RemoteWithRefs = await this.getOrigin();
    if (!remote) {
      await this.git.addRemote("origin", this.repoUrl);
    } else if (remote.refs.push !== this.repoUrl) {
      await this.git.raw(['remote', 'set-url', 'origin', this.repoUrl]);
    }
    const updatedOrigin: RemoteWithRefs = await this.getOrigin();
    if (!updatedOrigin || updatedOrigin.refs.push !== this.repoUrl) return Promise.resolve(false);

    await this.git.checkout(["-B", branch]);
    const currentBranch: string = await this.git.raw(["rev-parse", "--abbrev-ref", "HEAD"]);
    return Promise.resolve(currentBranch === branch);
  }

  public async Commit(message: string): Promise<CommitSummary> {
    return this.git.commit(message);
  }

  public async Push(): Promise<void> {
    /* For some reason, the repo gave back a fatal: error cannot find username. Device not configured...
     * when using simplegit's regular push method. However, this is no longer the case though
     * I'm not entirely sure what fixed it. Though, as long as the user is still using https, there is a
     * possibility of error? Leaving the raw method with token at the bottom just in case.
     * https://github.com/github/hub/issues/1644
     * https://stackoverflow.com/questions/22147574/fatal-could-not-read-username-for-https-github-com-no-such-file-or-directo
     */
    let pushOpts: any = {'--set-upstream': null};
    if (this.forcePush) pushOpts['--force'] = null;

    return this.git.push('origin', this.branch, pushOpts);

    // let pushOpts: string[] = ['push', '--set-upstream'];
    // if (this.forcePush) pushOpts.push('--force');
    // const remoteUrl: string = `https://${this.owner}:${this.token}@${this.service}.com/${this.owner}/${this.repoName}`
    // return this.git.raw([...pushOpts, remoteUrl]);
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
