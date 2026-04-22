export class Sync {
  /**
   * Run when extension have been activated
   */
  public async bootstrap(): Promise<void> {
    state.commons = new Commons();

    await state.commons.StartMigrationProcess();
    const startUpSetting = await state.commons.GetSettings();
    const startUpCustomSetting = await state.commons.GetCustomSettings();

    if (startUpSetting) {
      const tokenAvailable: boolean =
        startUpCustomSetting.token != null && startUpCustomSetting.token !== "";
      const gistAvailable: boolean =
        startUpSetting.gist != null && startUpSetting.gist !== "";

      if (!startUpCustomSetting.downloadPublicGist && !tokenAvailable) {
        if (state.commons.webviewService.IsLandingPageEnabled()) {
          state.commons.webviewService.OpenLandingPage();
          return;
        }
      }

      if (gistAvailable) {
        if (startUpSetting.autoDownload) {
          vscode.commands
            .executeCommand("extension.downloadSettings")
            .then(async () => {
              if (
                startUpSetting.autoUpload &&
                tokenAvailable &&
                gistAvailable
              ) {
                await state.commons.HandleStartWatching();
                return;
              }
            });
        } else {
          if (startUpSetting.autoUpload && tokenAvailable && gistAvailable) {
            await state.commons.HandleStartWatching();
            return;
          }
        }
      }
    }
  }
  /**
   * Upload setting to github gist
   */
  public async upload(optArgument?: string): Promise<void> {
    // @ts-ignore
    // const args = arguments;
    let github: GitHubService = null;
    const localConfig = await state.commons.InitalizeSettings();

    if (!localConfig.customConfig.token) {
      state.commons.webviewService.OpenLandingPage("extension.updateSettings");
      return;
    }

    const allSettingFiles: File[] = [];
    let uploadedExtensions: ExtensionInformation[] = [];
    const ignoredExtensions: ExtensionInformation[] = [];
    const dateNow = new Date();
    await state.commons.HandleStopWatching();

    try {
      localConfig.publicGist = false;
      if (optArgument && optArgument === "publicGIST") {
        localConfig.publicGist = true;
      }

      // Added new feature to upload to repository
      if (optArgument && optArgument === "uploadToRepo") {
        const repo = await state.commons.GetRepository();
        if (repo) {
          const files = await this.getSettingsFiles();
          await this.uploadToRepository(repo, files);
          return;
        }
      }

      // Existing Gist upload logic
      if (localConfig.gist) {
        const githubService = new GitHubService(localConfig.customConfig.token);
        const gistFiles = await this.getSettingsFiles();
        await githubService.updateGist(localConfig.gist, gistFiles);
        vscode.window.showInformationMessage(localize("uploadSuccess"));
      }
    } catch (error) {
      console.error(error);
      vscode.window.showErrorMessage(localize("uploadError"));
    }
  }

  private async getSettingsFiles(): Promise<File[]> {
    const allSettingFiles: File[] = [];
    // Implementation to get all settings files
    return allSettingFiles;
  }

  private async uploadToRepository(repo: string, files: File[]): Promise<void> {
    // Implementation to upload files to a GitHub repository
    console.log("Uploading to repository: " + repo);
    // Add logic to create a new branch, commit files, and create a pull request
  }
}