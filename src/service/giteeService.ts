"use strict";

import fetch from "node-fetch";
import { File } from "./fileService";

export class GiteeService {
  public userName: string = null;
  public name: string = null;
  private url: string = "https://gitee.com/api/v5";
  private auth: string = null;
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

  constructor(userToken: string) {
    if (userToken !== null && userToken !== "") {
      this.auth = userToken;
    }
    if (userToken !== null && userToken !== "") {
      fetch(`${this.url}/user${this.getAccessToken()}`, {
        method: "GET"
      })
        .then(ret => ret.json())
        .then(res => {
          this.userName = res.login;
          this.name = res.name;
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
    this.GIST_JSON_EMPTY.access_token = this.auth;
    if (publicGist) {
      this.GIST_JSON_EMPTY.public = true;
    } else {
      this.GIST_JSON_EMPTY.public = false;
    }
    if (gistDescription !== null && gistDescription !== "") {
      this.GIST_JSON_EMPTY.description = gistDescription;
    }

    try {
      const res = await fetch(`${this.url}/gists`, {
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        method: "POST",
        body: JSON.stringify(this.GIST_JSON_EMPTY)
      }).then(ret => ret.json());

      if (res && res.id) {
        return res.id;
      } else {
        console.error("ID is null");
        console.log("Sync : " + "Response from Gitee is: ");
        console.log(res);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  public async ReadGist(GIST: string): Promise<any> {
    return await fetch(`${this.url}/gists/${GIST}${this.getAccessToken()}`, {
      method: "GET"
    })
      .then(ret => ret.json())
      .then(data => {
        return {
          data,
          public: data.public
        };
      });
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
    gistObject.access_token = this.auth;

    await fetch(`${this.url}/gists/${gistObject.id}`, {
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      method: "PATCH",
      body: JSON.stringify(gistObject)
    });
    return true;
  }

  private getAccessToken(): string {
    return `?access_token=${this.auth}`;
  }
}
