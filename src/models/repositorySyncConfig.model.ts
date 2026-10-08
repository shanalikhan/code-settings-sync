export class RepositorySyncConfig {
  public mode: "gist" | "repository" = "gist";
  public provider: "github" | "gitlab" = "github";
  public apiUrl = "https://api.github.com";
  public token = "";
  public repository = "";
  public remoteUrl = "";
  public branch = "master";
}
