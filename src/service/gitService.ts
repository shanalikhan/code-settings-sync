
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
  private token: string = null;

  constructor (workspace: string) {
    this.git = simplegit(workspace);
  }

  // public async initialize(repoUrl: string, token: string, forcePush?: boolean, forcePull?: boolean): Promise<boolean> {
  public async initialize(token: string, repoUrl: string, branch?: string, forcePush?: boolean, forcePull?: boolean): Promise<boolean> {
    await this.git.init();
    if (!repoUrl) return Promise.resolve(false);
    // this.token    = token;
    this.token = token;
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

    let currentBranch: string = await this.GetCurrentBranch();
    if (currentBranch !== this.branch) {
      await this.git.checkout(["-B", this.branch]);
      currentBranch = await this.GetCurrentBranch();
    }
    return Promise.resolve(currentBranch === this.branch);
  }

  public async Commit(message: string): Promise<CommitSummary> {
    return this.git.commit(message);
  }

  public async Push() {
    /* For some reason, the repo gave back a fatal: error could not read Username. Device not configured...
     * when using simplegit's regular push method. The fix requres the user to change the url to be ssh.
     * In order to circumvent that, we set the push url to the specific service website defaulting to https
     * and repository as stated in git-push documentation: https://git-scm.com/docs/git-push#URLS
     * Resources:
     * https://github.com/github/hub/issues/1644
     * https://stackoverflow.com/questions/22147574/fatal-could-not-read-username-for-https-github-com-no-such-file-or-directo
     */
    // let pushOpts: any = {'--set-upstream': null};
    // if (this.forcePush) pushOpts['--force'] = null;
    // return this.git.push('origin', this.branch, pushOpts);

    // TODO: Check if theres a better way to build the remote url
    const remoteUrl: string = `https://${this.owner}:${this.token}@${this.service}.com/${this.owner}/${this.repoName}`

    let pushOpts: string[] = ['push', '--set-upstream'];
    if (this.forcePush) pushOpts.push('--force');
    await this.git.raw([...pushOpts, remoteUrl]);
  }

  public async Add(files: File[]) {
    await Promise.all(files.map(file => this.addFile(file)));
  }

  public async addFile(file: File) {
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

  public async GetCurrentBranch(): Promise<string> {
    return this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  public async GetCommitID(): Promise<string> {
    return this.git.raw(['rev-parse', 'HEAD']);
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
