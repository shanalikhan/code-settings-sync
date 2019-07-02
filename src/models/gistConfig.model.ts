export class GistConfig {
  public token: string = "";
  public gistDescription: string = "Visual Studio Code Settings Sync Gist";
  public openTokenLink: boolean = true;
  public downloadPublicGist: boolean = false;
  public lastUpload: Date = null;
  public lastDownload: Date = null;
  public githubEnterpriseUrl: string = null;
  public askGistName: boolean = false;
}
