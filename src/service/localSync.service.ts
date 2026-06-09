"use strict";

import * as fs from "fs-extra";
import * as path from "path";
import { LocalSyncSettings } from "../models/localSyncSettings.model";
import { File, FileService } from "./file.service";

export class LocalSyncService {
  public static LOCAL_SETTINGS_FILE = "syncLocalSettings.json";

  public static async ExportFiles(
    folderPath: string,
    files: File[]
  ): Promise<boolean> {
    if (!folderPath || !files) {
      return false;
    }

    await fs.mkdirs(folderPath);

    for (const file of files) {
      const fileName = file.gistName || file.fileName;
      const targetPath = await FileService.CreateDirTree(
        LocalSyncService.EnsureTrailingSeparator(folderPath),
        fileName
      );
      const written = await FileService.WriteFile(targetPath, file.content);

      if (!written) {
        return false;
      }
    }

    return true;
  }

  public static async ImportFiles(
    folderPath: string,
    customSettings: any = LocalSyncService.CreateDefaultImportConfig()
  ): Promise<File[]> {
    if (!folderPath || !(await FileService.IsDirectory(folderPath))) {
      return [];
    }

    return FileService.ListFiles(folderPath, customSettings);
  }

  public static async ReadSettings(
    filePath: string
  ): Promise<LocalSyncSettings> {
    if (!(await FileService.FileExists(filePath))) {
      return new LocalSyncSettings();
    }

    const content = await FileService.ReadFile(filePath);
    return Object.assign(new LocalSyncSettings(), JSON.parse(content));
  }

  public static async WriteSettings(
    filePath: string,
    settings: LocalSyncSettings
  ): Promise<boolean> {
    await fs.mkdirs(path.dirname(filePath));
    return FileService.WriteFile(filePath, JSON.stringify(settings, null, 2));
  }

  private static EnsureTrailingSeparator(folderPath: string): string {
    return folderPath.endsWith(path.sep) ? folderPath : folderPath + path.sep;
  }

  private static CreateDefaultImportConfig() {
    return {
      ignoreUploadFiles: [
        "state.*",
        LocalSyncService.LOCAL_SETTINGS_FILE,
        ".DS_Store",
        "sync.lock",
        "projects.json",
        "projects_cache_vscode.json",
        "projects_cache_git.json",
        "projects_cache_svn.json",
        "gpm_projects.json",
        "gpm-recentItems.json"
      ],
      ignoreUploadFolders: ["workspaceStorage"],
      supportedFileExtensions: ["json", "code-snippets"]
    };
  }
}
