"use strict";

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as recursiveRead from "recursive-readdir";
import { CustomConfig } from "../models/customConfig.model";
import { File, FileService } from "./file.service";

export class LocalSyncService {
  public static CUSTOMIZED_FOLDER = "customized_sync";
  public static CLOUD_SETTINGS_FILE = "cloudSettings.json";

  public static async ExportFiles(
    folderPath: string,
    files: File[]
  ): Promise<boolean> {
    if (!folderPath || !files) {
      return false;
    }

    const root = LocalSyncService.ResolveFolderPath(folderPath);
    await fs.mkdirs(root);

    for (const file of files) {
      const relativeName = LocalSyncService.ToRelativePath(
        file.gistName || file.fileName
      );
      const targetPath = path.join(root, ...relativeName.split("|"));
      await fs.mkdirs(path.dirname(targetPath));
      const written = await FileService.WriteFile(targetPath, file.content);
      if (!written) {
        return false;
      }
    }

    return true;
  }

  public static async ImportFiles(
    folderPath: string,
    customSettings: CustomConfig
  ): Promise<File[]> {
    const root = LocalSyncService.ResolveFolderPath(folderPath);
    if (!root || !(await FileService.IsDirectory(root))) {
      return [];
    }

    function folderMatcher(file: string, stats: fs.Stats) {
      if (stats.isDirectory()) {
        return customSettings.ignoreUploadFolders.some(fold => {
          return file.split(path.sep).includes(fold);
        });
      }
      return false;
    }

    function fileExtensionMatcher(file: string, stats: fs.Stats) {
      if (stats.isDirectory()) {
        return false;
      }
      const base = path.basename(file);
      if (base === LocalSyncService.CLOUD_SETTINGS_FILE) {
        return false;
      }
      const relative = path.relative(root, file);
      if (relative.split(path.sep)[0] === LocalSyncService.CUSTOMIZED_FOLDER) {
        return false;
      }
      const ext = path.extname(file).slice(1);
      if (!customSettings.supportedFileExtensions.includes(ext)) {
        return true;
      }
      return false;
    }

    const paths: string[] = await recursiveRead(root, [
      ...customSettings.ignoreUploadFiles,
      folderMatcher,
      fileExtensionMatcher
    ]);

    const files: File[] = [];
    for (const absolutePath of paths) {
      const content = await FileService.ReadFile(absolutePath);
      if (content === null || content === undefined) {
        continue;
      }
      const relative = path.relative(root, absolutePath);
      const gistName = LocalSyncService.ToGistName(relative);
      files.push(
        new File(path.basename(absolutePath), content, absolutePath, gistName)
      );
    }
    return files;
  }

  public static ResolveFolderPath(folderPath: string): string {
    if (!folderPath) {
      return "";
    }
    return folderPath.replace(/^~(?=$|\/|\\)/, os.homedir());
  }

  public static ToRelativePath(gistName: string): string {
    if (gistName === "cloudSettings") {
      return LocalSyncService.CLOUD_SETTINGS_FILE;
    }
    const prefix = FileService.CUSTOMIZED_SYNC_PREFIX;
    if (gistName.indexOf(prefix) === 0) {
      return (
        LocalSyncService.CUSTOMIZED_FOLDER +
        "|" +
        gistName.substring(prefix.length)
      );
    }
    return gistName;
  }

  public static ToGistName(relativePath: string): string {
    const normalized = relativePath.split(path.sep).join("|");
    if (
      normalized === LocalSyncService.CLOUD_SETTINGS_FILE ||
      normalized === "cloudSettings"
    ) {
      return "cloudSettings";
    }
    if (normalized.indexOf(LocalSyncService.CUSTOMIZED_FOLDER + "|") === 0) {
      return (
        FileService.CUSTOMIZED_SYNC_PREFIX +
        normalized.substring((LocalSyncService.CUSTOMIZED_FOLDER + "|").length)
      );
    }
    return normalized;
  }
}
