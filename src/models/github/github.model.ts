import { GitHubGistConfig } from "./githubGist.model";

export class GitHubConfig {
  public token: string = "";
  public enterpriseUrl: string = "";
  public openTokenLink: boolean = true;
  public gistSettings: GitHubGistConfig = new GitHubGistConfig();
}
