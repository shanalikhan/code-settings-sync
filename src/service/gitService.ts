
"use strict";

import * as vscode from "vscode";
import { File, FileService } from "./fileService";
import * as simplegit from "simple-git/promise";
import { RemoteWithRefs, CommitSummary } from "simple-git/typings/response";
import localize from "../localize";
import { Environment } from "../environmentPath";
import { PluginService, ExtensionInformation } from "./pluginService";
import { ExtensionConfig, CustomSettings, LocalConfig } from "../setting";
import Commons from "../commons";

export enum UrlInfo {
  FULL     = 0,
  PROTOCOL = 1,
  SERVICE  = 2,
  OWNER    = 3,
  REPONAME = 4,
};

export class GitService {
  public owner: string = null;
  public service: string = null;
  public repoUrl: string = null;
  public repoName: string = null;
  public protocol: string = null;
  public forcePush: boolean = false;
  public forcePull: boolean = false;
  public branch: string = 'master';
  public git: simplegit.SimpleGit = null;

  public static sshRegex: RegExp = /^(git)@(github|gitlab).com:([a-zA-Z0-9]+)\/([a-zA-Z0-9\-]+).git$/;
  public static httpsRegex: RegExp = /^(https):\/\/(?:www.)?(github|gitlab).com\/([a-zA-Z0-9]+)\/([a-zA-Z0-9\-]+).git$/;
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

  public async initialize(repoUrl: string, token: string, branch?: string, forcePush?: boolean, forcePull?: boolean): Promise<boolean> {
    console.log("Git Initializing...");
    await this.git.init();
    if (!repoUrl) return Promise.resolve(false);
    this.token = token;
    // Pushing / Pulling does not work with ssh as it requires the local config to already have ssh properly configured.
    // It would also break the token pushing currently implemented. Thus, default all ssh urls to https to make everything
    // use the same protocol.
    this.repoUrl  = repoUrl.replace('git@', 'https://').replace('.com:','.com/');
    this.repoName = await GitService.ParseUrl(repoUrl, UrlInfo.REPONAME);
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
     * when using simplegit's regular push method. This is probably due to the local git not being properly configured
     * with the correct credentials. In order to circumvent that, we set the push url including username and token password
     * to the specific service website defaulting using https (TOKEN PUSHING ONLY WORKS THROUGH HTTPS) and repository
     * as stated in git-push documentation:
     * https://git-scm.com/docs/git-push#URLS
     * Resources:
     * https://github.com/github/hub/issues/1644
     * https://stackoverflow.com/questions/22147574/fatal-could-not-read-username-for-https-github-com-no-such-file-or-directo
     */
    // Setting the upstream when pushing to the url does not work since the origin ref is not techincally the same as
    // the remote url. (remote url contains the username and token, so cannot set it as remote or it represents a security issue which
    // anyone would be able to see the token if the do a remote -v)
    let pushOpts: string[] = ['push'];
    if (this.forcePush) pushOpts.push('--force');
    await this.git.raw([...pushOpts, this.remoteUrl, this.branch]);
  }

  public async Pull() {
    try {
      // Due to the issue stated in the push method, we cannot use refspecs like origin to do any of
      // the pulling, forcing us to use the actual url. While pushing is able to send along
      // the username and token, we are calling reset --hard on the ref origin/branch when downloading to force changes.
      // Therefore, we also have to fetch the data from the url and it's specific branch. This also serves as a branch
      // check for the remote since it'll error out if the branch does not exist on the specific repo.
      console.log("Updating refs...");
      console.log(await this.git.fetch(this.remoteUrl, this.branch));
    } catch (err) {
      console.error(err);
      throw new Error(err);
    }
    // While fetching with the url updates the refs if it points to another url, for some reason it doesn't actually
    // update the data contained in the refs, so calling a reset without the default fetch would just use the old refs
    // to update the local repo regardless of any url changes. This makes sure the correct files are being used.
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
      // tracks the right branch. However, I'm not too sure if this is even really necessary since we're fetching
      // the specific branch anyways at the beginning of the method.
      console.log("Setting upstream branch...");
      console.log(await this.git.raw(['branch', '-u', `origin/${this.branch}`]));
    } catch(err) {
      console.error(err);
    }
  }

  public async Upload(
    allSettingFiles: File[],
    dateNow: Date,
    env?: Environment,
    common?: Commons,
    localConfig?: LocalConfig,
    syncSetting?: ExtensionConfig,
    customSettings?: CustomSettings
  ): Promise<string> {
    vscode.window.setStatusBarMessage(
      localize("cmd.updateSettings.info.addingFile"),
      1000
    );
    console.log("Adding Files...");
    await this.Add(allSettingFiles);

    vscode.window.setStatusBarMessage(
      localize("cmd.updateSettings.info.committing"),
      1000
    );
    console.log("Commiting...");
    await this.Commit(dateNow.toString());

    vscode.window.setStatusBarMessage(
      localize("cmd.updateSettings.info.pushing"),
      1000
    );
    console.log("Pushing to repository...");
    await this.Push();

    const status: any = await this.Status();
    console.log(status);
    return this.GetCommitID();
  }

  public async Download(
    env: Environment,
    syncSetting: ExtensionConfig,
    customSettings: CustomSettings,
    localConfig?: LocalConfig,
    common?: Commons
  ): Promise<any> {
    await this.Pull();

    const extensionFile: File = await FileService.GetFile(env.FILE_EXTENSION, env.FILE_EXTENSION_NAME);
    const ignoredExtensions: string[] = customSettings.ignoreExtensions || new Array<string>();

    let addedExtensions: ExtensionInformation[] = [];
    let deletedExtensions: ExtensionInformation[] = [];
    if (extensionFile && syncSetting.syncExtensions) {
      console.log("Syncing Extensions...");
      [addedExtensions, deletedExtensions] = await PluginService.UpdateExtensions(
        env, extensionFile.content, ignoredExtensions, syncSetting.removeExtensions, syncSetting.quietSync
      );
    }
    console.log("download finished");
    // TODO: Get updated files list for download
    return Promise.resolve([[], addedExtensions, deletedExtensions]);
  }

  public async Add(files: File[]) {
    await Promise.all(files.map(file => this.git.add(file.filePath)));
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
    return Promise.resolve(matchedString[regexPos]);
  }

  public async GetCurrentBranch(): Promise<string> {
    // Current branch always defaults to master because that's the branch git init defaults too
    // If there are no current commits on the specific branch, it will error out the when trying to parse,
    // so defaulting to master allows us to circumvent a problem when the user initializes for the first time but
    // wants to download or upload to a different branch than master
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
