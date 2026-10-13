export class RepositoryConfig {
  public provider = "github";
  public apiUrl = "https://api.github.com";
  public url = "";
  public branch = "master";
  public token = "";
  public lastUpload: Date = null;
  public lastDownload: Date = null;
}
