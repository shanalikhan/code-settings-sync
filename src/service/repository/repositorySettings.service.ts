import * as HttpsProxyAgent from "https-proxy-agent";
import * as vscode from "vscode";
import { RepositoryConfig } from "../../models/repositoryConfig.model";
import { state } from "../../state";
import { createRepository } from "./repositoryApi.service";
import { validateRepository } from "./repositoryStorage.service";

export async function handleRepositoryMessage(
  message: any,
  panel: vscode.WebviewPanel
): Promise<boolean> {
  if (
    !["repository.get", "repository.save", "repository.create"].includes(
      message.command
    )
  ) {
    return false;
  }
  try {
    const settings = await state.commons.GetCustomSettings();
    if (message.command !== "repository.get") {
      if (
        state.watcher.autoUploadService &&
        state.watcher.autoUploadService.watching
      ) {
        throw new Error(
          "Turn off Auto Upload before changing storage settings."
        );
      }
      const input = message.data;
      if (
        !input ||
        !["GitHubGist", "GitRepository"].includes(input.syncMethod)
      ) {
        throw new Error("Select Gist or Git Repository.");
      }
      const previous = settings.repositorySettings;
      const repository = Object.assign(new RepositoryConfig(), {
        provider: String(input.provider),
        apiUrl: String(input.apiUrl).trim(),
        url: String(input.url).trim(),
        branch: String(input.branch).trim(),
        token: input.token ? String(input.token).trim() : previous.token,
        lastDownload: previous.lastDownload,
        lastUpload: previous.lastUpload
      });
      if (
        input.syncMethod === "GitRepository" ||
        message.command === "repository.create"
      ) {
        validateRepository(repository, message.command !== "repository.create");
      }
      if (
        (repository.provider !== previous.provider ||
          repository.apiUrl !== previous.apiUrl) &&
        !input.token
      ) {
        throw new Error(
          "Enter a token for the newly selected provider or server."
        );
      }
      if (message.command === "repository.create") {
        const proxy =
          vscode.workspace.getConfiguration("http").get<string>("proxy") ||
          process.env.HTTPS_PROXY ||
          process.env.HTTP_PROXY;
        repository.url = await createRepository(
          repository,
          String(input.name),
          undefined,
          proxy ? new HttpsProxyAgent(proxy) : undefined
        );
      }
      if (
        repository.url !== previous.url ||
        repository.branch !== previous.branch ||
        settings.syncMethod !== input.syncMethod
      ) {
        repository.lastDownload = null;
        repository.lastUpload = null;
      }
      settings.repositorySettings = repository;
      settings.syncMethod = input.syncMethod;
      if (!(await state.commons.SetCustomSettings(settings))) {
        throw new Error("Storage settings could not be saved.");
      }
    }
    await panel.webview.postMessage({
      command: "repository.settings",
      syncMethod: settings.syncMethod,
      data: { ...settings.repositorySettings, token: "" },
      tokenSet: !!settings.repositorySettings.token
    });
  } catch (error) {
    await panel.webview.postMessage({
      command: "repository.error",
      message: error.message
    });
  }
  return true;
}
