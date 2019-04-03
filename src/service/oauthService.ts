import * as express from "express";
import { Server } from "http";
import fetch from "node-fetch";
import { URLSearchParams } from "url";
import Commons from "../commons";

export class GitHubOAuthService {
  public app: express.Express;
  public server: Server;

  constructor(public port: number, public commons: Commons) {
    this.app = express();
    this.app.use(express.json(), express.urlencoded({ extended: false }));
  }

  public async StartProcess() {
    this.server = this.app.listen(this.port);
    this.app.get("/callback", async (req, res) => {
      const token = await this.getToken(req.param("code"));
      const params = new URLSearchParams(await token.text());
      this.saveToken(params.get("access_token"));
      res.send("Token saved! You may now close this tab.");
      this.server.close();
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

  public async saveToken(token: string) {
    const currentSettings = await this.commons.GetCustomSettings();
    currentSettings.token = token;
    this.commons.SetCustomSettings(currentSettings);
  }
}
