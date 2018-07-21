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

const proxyURL: string =
  vscode.workspace.getConfiguration("http").get("proxy") ||
  (process.env as IEnv).http_proxy ||
  (process.env as IEnv).HTTP_PROXY;

let host: string = vscode.workspace.getConfiguration("sync").get("host");
let pathPrefix: string = vscode.workspace
  .getConfiguration("sync")
  .get("pathPrefix");

if (!host || host === "") {
  host = "api.github.com";
  pathPrefix = "";
}

const githubApiConfig: GitHubApi.Options = {
  host,
  pathPrefix,
  rejectUnauthorized: false
};

if (proxyURL) {
  githubApiConfig.proxy = proxyURL;
  githubApiConfig.agent = new HttpsProxyAgent(proxyURL);
}

const github = new GitHubApi(githubApiConfig);

export class GitHubService {
  public userName: string = null;
  public name: string = null;
  private GIST_JSON_EMPTY: any = {
    description: "Visual Studio Code Sync Settings Gist",
    public: false,
    files: {
      "settings.json": {
        content: "// Empty"
      },
      "launch.json": {
        content: "// Empty"
      },
      "keybindings.json": {
        content: "// Empty"
      },
      "extensions.json": {
        content: "// Empty"
      },
      "locale.json": {
        content: "// Empty"
      },
      "keybindingsMac.json": {
        content: "// Empty"
      },
      cloudSettings: {
        content: "// Empty"
      }
    }
  };

  constructor(private TOKEN: string) {
    if (TOKEN !== null && TOKEN !== "") {
      try {
        github.authenticate({
          type: "oauth",
          token: TOKEN
        });
      } catch (err) {
        console.error(err);
      }

      github.users
        .get({})
        .then(res => {
          this.userName = res.data.login;
          this.name = res.data.name;
          console.log(
            "Sync : Connected with user : " + "'" + this.userName + "'"
          );
        })
        .catch(err => {
          console.error(err);
        });
    }
  }

  public AddFile(list: File[], GIST_JSON_B: any) {
    for (const file of list) {
      if (file.content !== "") {
        GIST_JSON_B.files[file.gistName] = {};
        GIST_JSON_B.files[file.gistName].content = file.content;
      }
    }
    return GIST_JSON_B;
  }

  public async CreateEmptyGIST(
    publicGist: boolean,
    gistDescription: string
  ): Promise<string> {
    if (publicGist) {
      this.GIST_JSON_EMPTY.public = true;
    } else {
      this.GIST_JSON_EMPTY.public = false;
    }
    if (gistDescription !== null && gistDescription !== "") {
      this.GIST_JSON_EMPTY.description = gistDescription;
    }

    try {
      const res = await github.gists.create(this.GIST_JSON_EMPTY);
      if (res.data && res.data.id) {
        return res.data.id;
      } else {
        console.error("ID is null");
        console.log("Sync : " + "Response from GitHub is: ");
        console.log(res);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  public async CreateAnonymousGist(
    publicGist: boolean,
    files: File[],
    gistDescription: string
  ): Promise<any> {
    if (publicGist) {
      this.GIST_JSON_EMPTY.public = true;
    } else {
      this.GIST_JSON_EMPTY.public = false;
    }
    if (gistDescription !== null && gistDescription !== "") {
      this.GIST_JSON_EMPTY.description = gistDescription;
    }

    const gist: any = this.AddFile(files, this.GIST_JSON_EMPTY);

    try {
      const res = await github.gists.create(gist);
      if (res.data && res.data.id) {
        return res.data.id;
      } else {
        console.error("ID is null");
        console.log("Sync : " + "Response from GitHub is: ");
        console.log(res);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  public async ReadGist(GIST: string): Promise<any> {
    return await github.gists.get({ gist_id: GIST, id: GIST });
  }

  public UpdateGIST(gistObject: any, files: File[]): any {
    const allFiles: string[] = Object.keys(gistObject.data.files);
    for (const fileName of allFiles) {
      let exists = false;

      for (const settingFile of files) {
        if (settingFile.gistName === fileName) {
          exists = true;
        }
      }

      if (!exists && !fileName.startsWith("keybindings")) {
        gistObject.data.files[fileName] = null;
      }
    }

    gistObject.data = this.AddFile(files, gistObject.data);
    return gistObject;
  }

  public async SaveGIST(gistObject: any): Promise<boolean> {
    await github.gists.edit(gistObject);
    return true;
  }
}
