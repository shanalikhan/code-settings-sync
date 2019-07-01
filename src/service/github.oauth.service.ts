import * as express from "express";
import { Server } from "http";
import fetch from "node-fetch";
import { URL, URLSearchParams } from "url";
import { state } from "../state";
import { LoggerService } from "./logger.service";

export class GitHubOAuthService {
  public app: express.Express;
  public server: Server;

  constructor(public port: number) {
    this.app = express();
    this.app.use(express.json(), express.urlencoded({ extended: false }));
  }

  public async StartProcess() {
    const customSettings = await state.settings.GetCustomSettings();
    const host = customSettings.githubEnterpriseUrl
      ? new URL(customSettings.githubEnterpriseUrl)
      : new URL("https://github.com");

    this.server = this.app.listen(this.port);
    this.app.get("/callback", async (req, res) => {
      try {
        const params = new URLSearchParams(
          await (await this.getToken(req.param("code"), host)).text()
        );

        res.send(`
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
          </head>
          <body>
              <h1>Success! You may now close this tab.</h1>
              <style>
                html, body {
                  background-color: #1a1a1a;
                  color: #c3c3c3;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100%;
                  width: 100%;
                  margin: 0;
                }
              </style>
          </body>
        </html>
        `);
        this.server.close();

        const token = params.get("access_token");
        this.saveToken(token);

        const user = await this.getUser(token, host);

        const gists: any[] = await this.getGists(token, user, host);

        if (gists.length) {
          state.commons.webviewService.OpenGistSelectionpage(gists);
        }
      } catch (err) {
        const error = new Error(err);
        LoggerService.LogException(error, LoggerService.defaultError, true);
      }
    });
  }

  public getToken(code: string, host: URL) {
    const params = new URLSearchParams();
    params.append("client_id", "cfd96460d8b110e2351b");
    params.append("client_secret", "ed46bd3a0f736e0da57308e86ca5fa3cf8688582");
    params.append("code", code);

    const promise = fetch(`https://${host.hostname}/login/oauth/access_token`, {
      method: "POST",
      body: params
    });

    promise.catch(err => {
      LoggerService.LogException(
        err,
        "Sync: Invalid GitHub Enterprise URL.",
        true
      );
    });

    return promise;
  }

  public async getGists(token: string, user: string, host: URL) {
    const promise = fetch(`https://api.${host.hostname}/users/${user}/gists`, {
      method: "GET",
      headers: { Authorization: `token ${token}` }
    });

    promise.catch(err => {
      LoggerService.LogException(
        err,
        "Sync: Invalid GitHub Enterprise URL.",
        true
      );
    });

    const res = await promise;
    const gists = await res.json();
    return gists;
  }

  public async saveToken(token: string) {
    const currentSettings = await state.settings.GetCustomSettings();
    currentSettings.token = token;
    state.settings.SetCustomSettings(currentSettings);
  }

  public async getUser(token: string, host: URL) {
    const promise = fetch(`https://api.${host.hostname}/user`, {
      method: "GET",
      headers: { Authorization: `token ${token}` }
    });

    promise.catch(err => {
      LoggerService.LogException(
        err,
        "Sync: Invalid GitHub Enterprise URL.",
        true
      );
    });

    const res = await promise;
    const json = await res.json();
    return json.login;
  }
}
