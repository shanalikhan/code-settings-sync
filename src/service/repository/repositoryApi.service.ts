import fetch from "node-fetch";
import { RepositoryConfig } from "../../models/repositoryConfig.model";
import { validateRepository } from "./repositoryStorage.service";

export async function createRepository(
  config: RepositoryConfig,
  name: string,
  request = fetch,
  agent?: any
): Promise<string> {
  validateRepository(config, false);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error(
      "Enter a repository name using letters, numbers, dots, underscores or hyphens."
    );
  }
  const github = config.provider === "github";
  const response = await request(
    config.apiUrl.replace(/\/$/, "") + (github ? "/user/repos" : "/projects"),
    {
      method: "POST",
      redirect: "error",
      agent,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "code-settings-sync",
        ...(github
          ? { Authorization: "token " + config.token }
          : { "PRIVATE-TOKEN": config.token })
      },
      body: JSON.stringify(
        github
          ? { name, private: true, auto_init: false }
          : { name, visibility: "private", initialize_with_readme: false }
      )
    }
  );
  if (!response.ok) {
    throw new Error(
      `Repository creation failed (HTTP ${response.status}). Check the API URL and token permissions.`
    );
  }
  const data = await response.json();
  const url: string = github ? data.clone_url : data.http_url_to_repo;
  validateRepository({ ...config, url });
  return url;
}
