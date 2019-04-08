"use strict";

import * as fs from "fs-extra";
import * as http from "http";
import * as https from "https";
import * as HttpsProxyAgent from "https-proxy-agent";
import * as _temp from "temp";
import * as url from "url";
import * as vscode from "vscode";

import { OsType } from "./enums";

interface IHeaders {
  [key: string]: string;
}

interface IEnv {
  [key: string]: string | undefined;
  http_proxy: string;
  HTTP_PROXY: string;
}

const temp = _temp.track();
const HTTP_PROXY: string =
  (process.env as IEnv).http_proxy || (process.env as IEnv).HTTP_PROXY;

const proxy =
  vscode.workspace.getConfiguration("http").get("proxy") || HTTP_PROXY;
let agent = null;
if (proxy) {
  if (proxy !== "") {
    agent = new HttpsProxyAgent(proxy);
  }
}

export class Util {
  public static GetCodeCli(osType: OsType, isInsiders: boolean): string {
    let codeCli: string = process.argv0;
    let codeLastFolder = "";
    let codeCliPath = "";

    if (osType === OsType.Windows) {
      if (isInsiders) {
        codeLastFolder = "Code - Insiders";
        codeCliPath = "bin/code-insiders";
      } else {
        codeLastFolder = "Code";
        codeCliPath = "bin/code";
      }
    } else if (osType === OsType.Linux) {
      if (isInsiders) {
        codeLastFolder = "code-insiders";
        codeCliPath = "bin/code-insiders";
      } else {
        codeLastFolder = "code";
        codeCliPath = "bin/code";
      }
    } else if (osType === OsType.Mac) {
      codeLastFolder = "Frameworks";
      codeCliPath = "Resources/app/bin/code";
    }

    codeCli =
      '"' +
      codeCli.substr(0, codeCli.lastIndexOf(codeLastFolder)) +
      codeCliPath +
      '"';

    return codeCli;
  }

  public static HttpPostJson(path: string, obj: any, headers: IHeaders) {
    return new Promise<string>((resolve, reject) => {
      const item = url.parse(path);
      const postData = JSON.stringify(obj);
      const newHeader = {
        "Content-Length": Buffer.byteLength(postData),
        "Content-Type": "application/json",
        ...headers
      };
      const options: https.RequestOptions = {
        host: item.hostname,
        path: item.path,
        headers: newHeader,
        method: "POST"
      };
      if (item.port) {
        options.port = +item.port;
      }
      if (agent != null) {
        options.agent = agent;
      }

      if (item.protocol.startsWith("https:")) {
        const req = https.request(options, res => {
          if (res.statusCode !== 200) {
            // reject();
            // return;
          }

          let result = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: Buffer | string) => {
            result += chunk;
          });
          res.on("end", () => resolve(result));

          res.on("error", (err: Error) => reject(err));
        });

        req.write(postData);
        req.end();
      } else {
        const req = http.request(options, res => {
          let result = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: Buffer | string) => {
            result += chunk;
          });
          res.on("end", () => resolve(result));

          res.on("error", (err: Error) => reject(err));
        });
        req.write(postData);
        req.end();
      }
    });
  }
  public static HttpGetFile(path: string): Promise<string> {
    const tempFile = temp.path();
    const file = fs.createWriteStream(tempFile);
    const item = url.parse(path);
    const options: https.RequestOptions = {
      host: item.hostname,
      path: item.path
    };
    if (item.port) {
      options.port = +item.port;
    }
    if (agent != null) {
      options.agent = agent;
    }
    return new Promise<string>((resolve, reject) => {
      if (path.startsWith("https:")) {
        https
          .get(options, res => {
            res.pipe(file);
            file.on("finish", () => {
              file.close();
              resolve(tempFile);
            });
          })
          .on("error", e => {
            reject(e);
          });
      } else {
        http
          .get(options, res => {
            // return value
            res.pipe(file);
            file.on("finish", () => {
              file.close();
              resolve(tempFile);
            });
          })
          .on("error", e => {
            reject(e);
          });
      }
    });
  }

  public static async WriteToFile(content: Buffer): Promise<string> {
    const tempFile: string = temp.path();
    await fs.writeFile(tempFile, content);
    return tempFile;
  }

  public static async Sleep(ms: number): Promise<number> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(ms);
      }, ms);
    }) as Promise<number>;
  }
  /**
   * promisify the function
   * it will be remove when vscode use node@^8.0
   * @param fn
   */
  public static promisify(
    fn: (...args: any[]) => any
  ): (...whatever: any[]) => Promise<any> {
    return function(...argv) {
      return new Promise((resolve, reject) => {
        fn.call(this, ...argv, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });
    };
  }
}
