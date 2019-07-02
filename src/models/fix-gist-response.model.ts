import * as GitHubApi from "@octokit/rest";

export interface IFixGistResponse
  extends Omit<GitHubApi.GistsGetResponse, "files"> {
  files: any | GitHubApi.GistsGetResponseFiles;
}
