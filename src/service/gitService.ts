
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
  public static httpsRegex: RegExp = /^https:\/\/(?:www.)?(github|gitlab).com\/([a-zA-Z0-9]+)\/([a-zA-Z0-9\-]+).git$/;
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
  private remoteUrl: string = null;

  constructor (workspace: string) {
    this.git = simplegit(workspace);
    this.git.silent(true);
  }

  // public async initialize(repoUrl: string, token: string, forcePush?: boolean, forcePull?: boolean): Promise<boolean> {
  public async initialize(token: string, repoUrl: string, branch?: string, forcePush?: boolean, forcePull?: boolean): Promise<boolean> {
    await this.git.init();
    if (!repoUrl) return Promise.resolve(false);
    this.token = token;
    this.repoUrl  = repoUrl;
    this.repoName = await GitService.ParseUrl(repoUrl, UrlInfo.NAME);
    this.owner    = await GitService.ParseUrl(repoUrl, UrlInfo.OWNER);
    this.service  = await GitService.ParseUrl(repoUrl, UrlInfo.SERVICE);
    this.remoteUrl = `https://${this.owner}:${this.token}@${this.service}.com/${this.owner}/${this.repoName}.git`

    if (branch) this.branch = branch;
    if (forcePush) this.forcePush = forcePush;
    if (forcePull) this.forcePull = forcePull;

    const remote: RemoteWithRefs = await this.getOrigin();
    if (!remote) {
      await this.git.addRemote('origin', this.repoUrl);
    } else if (remote.refs.push !== this.repoUrl) {
      await this.git.raw(['remote', 'set-url', 'origin', this.repoUrl]);
    }
    const updatedOrigin: RemoteWithRefs = await this.getOrigin();
    if (!updatedOrigin || updatedOrigin.refs.push !== this.repoUrl) return Promise.resolve(false);

    let currentBranch: string = await this.GetCurrentBranch();
    if (currentBranch !== this.branch) {
      console.log("Changing current branch...");
      // Slightly dangerous since -B does reset the branch
      // However, since we only checkout if we are not on the current branch, this should be safe
      await this.git.checkout(['-B', this.branch]);
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

    let pushOpts: string[] = ['push', '--set-upstream'];
    if (this.forcePush) pushOpts.push('--force');
    await this.git.raw([...pushOpts, this.remoteUrl, this.branch]);
  }

  public async Pull() {
    try {
      // Due to the issue stated in the push method, we need to authenticate with the remote repo
      // before being able to do any push / pulling using refs like origin instead of the actual url.
      // While pushing is able to send along the username and token, we are calling reset --hard when downloading
      // Thus not sending along proper authentication and will fail.
      console.log("Authenticating...");
      console.log(await this.git.fetch(this.remoteUrl, this.branch));
    } catch (err) {
      console.error(err);
    }
    // Fetching will give a refspec error if the branch does not exist allowing a clean exit from pulling
    // Maybe change the error message to make it more clear?
    console.log("Fetching...");
    await this.git.fetch();
    if (this.forcePull) {
      console.log("Force Pull is ON...resetting...")
      await this.git.raw(['reset', '--hard', `origin/${this.branch}`]);
    } else {
      // Haven't really testing not forcing the pull yet.
      // Not sure if it will correctly track the remote origin if it doesn't reset based off of
      // the remote branch...
      console.log("Force Pull is OFF...downloading...");
      await this.git.pull();
    }
    try {
      // If there has been no commits yet, or the repo has not been updated, setting the branch
      // to track will always fail until we have successfully downloaded at least 1 time.
      // Thus, always just manually set the upstream right after pulling to guarantee it correctly
      // tracks the right branch
      console.log("Setting upstream branch...");
      console.log(await this.git.raw(['branch', '-u', `origin/${this.branch}`]));
    } catch(err) {
      console.error(err);
    }
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
    // Guaranteed as regex must match to get here
    return Promise.resolve(matchedString[matchedString.length - regexPos]);
  }

  public async GetCurrentBranch(): Promise<string> {
    // Current branch always defaults to master because that's the branch git init defaults too
    let currentBranch: string = 'master';
    try {
      currentBranch = await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch (err) {
      console.log("Current branch has no commits...defaulting to master");
    }
    return Promise.resolve(currentBranch);
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

  public async Status () {
    let statusSummary = null;
    try {
      statusSummary = await this.git.status();
    } catch (e) {
      console.error(e);
    }
    return statusSummary;
  }
}
