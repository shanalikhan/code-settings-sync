import * as express from "express";
import { readFileSync } from "fs";
import { Server } from "http";
import fetch from "node-fetch";
import { URLSearchParams } from "url";
import * as vscode from "vscode";
import Commons from "../commons";

export class GitHubOAuthService {
  public app: express.Express;
  public server: Server;
  public GistSelectionView: string;

  constructor(
    public port: number,
    public commons: Commons,
    public extensionPath: string
  ) {
    this.app = express();
    this.app.use(express.json(), express.urlencoded({ extended: false }));
    this.GistSelectionView = readFileSync(
      `${this.extensionPath}/ui/gist-selection/gist-selection.html`,
      { encoding: "utf8" }
    );
  }

  public async StartProcess() {
    this.server = this.app.listen(this.port);
    this.app.get("/callback", async (req, res) => {
      const params = new URLSearchParams(
        await (await this.getToken(req.param("code"))).text()
      );

      res.send("<script>window.close();</script>");
      this.server.close();

      const token = params.get("access_token");
      this.saveToken(token);

      const user = await this.getUser(token);

      const gists = await this.getGists(token, user);
      this.saveGistId(gists);
    });
  }

  public async getToken(code: string) {
    const params = new URLSearchParams();
    params.append("client_id", "cfd96460d8b110e2351b");
    params.append("client_secret", "ed46bd3a0f736e0da57308e86ca5fa3cf8688582");
    params.append("code", code);

    return await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      body: params
    });
  }

  public async getGists(token: string, user: string) {
    const res = await fetch(`https://api.github.com/users/${user}/gists`, {
      method: "GET",
      headers: { Authorization: `token ${token}` }
    });
    const gists = await res.json();
    return gists;
  }

  public async saveToken(token: string) {
    const currentSettings = await this.commons.GetCustomSettings();
    currentSettings.token = token;
    this.commons.SetCustomSettings(currentSettings);
  }

  public async saveGistId(gists: any) {
    const content: string = this.GistSelectionView.replace(
      new RegExp("@GISTS", "g"),
      JSON.stringify(gists)
    ).replace(
      new RegExp("@PWD", "g"),
      vscode.Uri.file(this.extensionPath)
        .with({
          scheme: "vscode-resource"
        })
        .toString()
    );
    const gistSelectionPanel = vscode.window.createWebviewPanel(
      "selectGist",
      "Select Your Existing Gist",
      vscode.ViewColumn.One,
      {
        retainContextWhenHidden: true,
        enableScripts: true
      }
    );
    gistSelectionPanel.webview.html = content;
    gistSelectionPanel.webview.onDidReceiveMessage(async message => {
      if (!message.close) {
        const extSettings = await this.commons.GetSettings();
        extSettings.gist = message.id;
        this.commons.SaveSettings(extSettings);
      }
      return gistSelectionPanel.dispose();
    });
  }

  public async getUser(token: string) {
    const res = await fetch("https://api.github.com/user", {
      method: "GET",
      headers: { Authorization: `token ${token}` }
    });
    const json = await res.json();
    return json.login;
  }
}
