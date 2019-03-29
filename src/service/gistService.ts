"use strict";

import * as GitHubApi from "@octokit/rest";
import * as HttpsProxyAgent from "https-proxy-agent";
import * as vscode from "vscode";
import { File } from "./fileService";

interface IEnv {
  [key: string]: string | undefined;
  http_proxy: string;
  HTTP_PROXY: string;
}

export class GistService {
  private gistAPI: GitHubApi = null;

  constructor(
    public options: {
      token: string;
      workingDirectory: string;
      username?: string;
      name?: string;
    }
  ) {
    const gistAPIConfig: GitHubApi.Options = {};

    const proxyURL: string =
      vscode.workspace.getConfiguration("http").get("proxy") ||
      (process.env as IEnv).http_proxy ||
      (process.env as IEnv).HTTP_PROXY;
    gistAPIConfig.baseUrl = this.options.workingDirectory;

    if (proxyURL) {
      gistAPIConfig.agent = new HttpsProxyAgent(proxyURL);
    }

    if (this.options.token && this.options.token !== "") {
      gistAPIConfig.auth = `token ${this.options.token}`;
      try {
        this.gistAPI = new GitHubApi(gistAPIConfig);
      } catch (err) {
        console.error(err);
      }

      this.gistAPI.users
        .getAuthenticated()
        .then(res => {
          this.options.username = res.data.login;
          this.options.name = res.data.name;
          console.log(
            "Sync: Logged in as " + "'" + this.options.username + "'"
          );
        })
        .catch(err => {
          console.error(err);
        });
    }
  }

  public PopulateGist(files: File[], gistData: GitHubApi.GistsGetResponse) {
    files.forEach(file => {
      if (file.content !== "") {
        gistData.files[file.gistName] = {};
        gistData.files[file.gistName].content = file.content;
      }
    });
    return gistData;
  }

  public async CreateEmptyGist(options: {
    public: boolean;
    description: string;
  }): Promise<string> {
    const emptyGist: GitHubApi.GistsCreateParams = {
      description: options.description,
      public: options.public,
      files: {}
    };

    try {
      const res = await this.gistAPI.gists.create(emptyGist);
      if (res.data && res.data.id) {
        return res.data.id.toString();
      } else {
        console.error("Gist ID is null");
        console.log(`Sync: Response from GitHub: ${res}`);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  public async ReadGist(id: string): Promise<any> {
    return await this.gistAPI.gists.get({ gist_id: id });
  }

  public UpdateGist(
    gistObject: GitHubApi.Response<GitHubApi.GistsGetResponse>,
    files: File[]
  ) {
    gistObject.data = this.PopulateGist(files, gistObject.data);
    return gistObject;
  }

  public async SaveGist(
    gistObject: GitHubApi.Response<GitHubApi.GistsGetResponse>
  ): Promise<boolean> {
    const params: GitHubApi.GistsUpdateParams = {
      gist_id: gistObject.data.id,
      description: gistObject.data.description,
      files: gistObject.data.files as GitHubApi.GistsUpdateParamsFiles
    };
    await this.gistAPI.gists.update(params);
    return true;
  }
}
