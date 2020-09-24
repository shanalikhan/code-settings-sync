export class GitHubGistConfig {
  public token: string = "";
  public gistDescription: string = "Visual Studio Code Settings Sync Gist";
  public downloadPublicGist: boolean = false;
  public lastUpload: Date = null;
  public lastDownload: Date = null;
  public askGistName: boolean = false;
  public askGistDescription: boolean = false;
}
