export class GitHubGistConfig {
  public token = "";
  public gistDescription = "Visual Studio Code Settings Sync Gist";
  public downloadPublicGist = false;
  public lastUpload: Date = null;
  public lastDownload: Date = null;
  public askGistName = false;
  public askGistDescription = false;
}
