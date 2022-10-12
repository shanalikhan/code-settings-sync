import { GitHubGistConfig } from "./githubGist.model";

export class GitHubConfig {
  public token = "";
  public enterpriseUrl = "";
  public openTokenLink = true;
  public gistSettings: GitHubGistConfig = new GitHubGistConfig();
}
