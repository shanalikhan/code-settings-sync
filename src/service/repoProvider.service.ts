"use strict";

import * as GitHubApi from "@octokit/rest";
import * as HttpsProxyAgent from "https-proxy-agent";
import fetch from "node-fetch";
import * as vscode from "vscode";

export type RepoProvider = "github" | "gitlab" | "custom";

interface IEnv {
  [key: string]: string | undefined;
  http_proxy: string;
  HTTP_PROXY: string;
}

export function getProxyUrl(): string {
  return (
    vscode.workspace.getConfiguration("http").get<string>("proxy") ||
    (process.env as IEnv).http_proxy ||
    (process.env as IEnv).HTTP_PROXY
  );
}

/**
 * Create a new private repository and return its clone URL.
 * @param baseUrl GitHub Enterprise API URL or GitLab base URL (optional)
 */
export async function createRepository(
  provider: RepoProvider,
  token: string,
  name: string,
  baseUrl?: string
): Promise<string> {
  const proxyURL = getProxyUrl();
  const agent = proxyURL ? new HttpsProxyAgent(proxyURL) : undefined;

  if (provider === "github") {
    const options: GitHubApi.Options = { auth: `token ${token}` };
    if (baseUrl) {
      options.baseUrl = baseUrl;
    }
    if (agent) {
      options.agent = agent;
    }
    const github = new GitHubApi(options);
    const res = await github.repos.createForAuthenticatedUser({
      name,
      private: true,
      description: "Visual Studio Code Settings Sync"
    });
    return res.data.clone_url;
  }

  if (provider === "gitlab") {
    const base = (baseUrl || "https://gitlab.com").replace(/\/+$/, "");
    const res = await fetch(`${base}/api/v4/projects`, {
      method: "POST",
      agent,
      headers: {
        "PRIVATE-TOKEN": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name, visibility: "private" })
    });
    if (!res.ok) {
      throw new Error(
        `Sync: Unable to create GitLab project (HTTP ${res.status}).`
      );
    }
    const project = await res.json();
    return project.http_url_to_repo;
  }

  throw new Error(
    "Sync: Repositories can only be created on GitHub or GitLab."
  );
}
