"use strict";

import * as fs from "fs-extra";
import * as path from "path";
import { OsType } from "../enums";
import { CloudSettings } from "../models/cloudSettings.model";
import { CustomConfig } from "../models/customConfig.model";
import PragmaUtil from "../pragmaUtil";
import { state } from "../state";
import { File, FileService } from "./file.service";
import { ExtensionInformation, PluginService } from "./plugin.service";

export class FsSyncService {
  /**
   * Export the current settings to the given folder path.
   */
  public static async Export(
    folderPath: string,
    customSettings: CustomConfig,
    syncExtensions: boolean
  ): Promise<{ files: File[]; uploadedExtensions: ExtensionInformation[] }> {
    const allSettingFiles: File[] = [];
    let uploadedExtensions: ExtensionInformation[] = [];

    await fs.mkdirs(folderPath);

    if (syncExtensions) {
      uploadedExtensions = PluginService.CreateExtensionList();
      if (
        customSettings.ignoreExtensions &&
        customSettings.ignoreExtensions.length > 0
      ) {
        uploadedExtensions = uploadedExtensions.filter(
          extension => !customSettings.ignoreExtensions.includes(extension.name)
        );
      }
      uploadedExtensions.sort((a, b) => a.name.localeCompare(b.name));
      const extensionFile: File = new File(
        state.environment.FILE_EXTENSION_NAME,
        JSON.stringify(uploadedExtensions, undefined, 2),
        state.environment.FILE_EXTENSION,
        state.environment.FILE_EXTENSION_NAME
      );
      allSettingFiles.push(extensionFile);
    }

    const contentFiles = await FileService.ListFiles(
      state.environment.USER_FOLDER,
      customSettings
    );

    const customFileKeys: string[] = Object.keys(customSettings.customFiles);
    for (const key of customFileKeys) {
      const val = customSettings.customFiles[key];
      const customFile: File = await FileService.GetCustomFile(val, key);
      if (customFile !== null) {
        allSettingFiles.push(customFile);
      }
    }

    for (const snippetFile of contentFiles) {
      if (snippetFile.fileName === state.environment.FILE_KEYBINDING_MAC) {
        continue;
      }
      if (snippetFile.content === "") {
        continue;
      }
      if (snippetFile.fileName === state.environment.FILE_KEYBINDING_NAME) {
        snippetFile.gistName =
          state.environment.OsType === OsType.Mac &&
          !customSettings.universalKeybindings
            ? state.environment.FILE_KEYBINDING_MAC
            : state.environment.FILE_KEYBINDING_DEFAULT;
      }
      if (
        snippetFile.fileName === state.environment.FILE_SETTING_NAME ||
        snippetFile.fileName === state.environment.FILE_KEYBINDING_MAC ||
        snippetFile.fileName === state.environment.FILE_KEYBINDING_DEFAULT
      ) {
        snippetFile.content = await PragmaUtil.processBeforeUpload(
          snippetFile.content
        );
      }
      allSettingFiles.push(snippetFile);
    }

    const cloudFile = new CloudSettings();
    cloudFile.lastUpload = new Date();
    allSettingFiles.push(
      new File(
        state.environment.FILE_CLOUDSETTINGS_NAME,
        JSON.stringify(cloudFile),
        "",
        state.environment.FILE_CLOUDSETTINGS_NAME
      )
    );

    for (const file of allSettingFiles) {
      const targetPath = path.join(folderPath, file.gistName);
      await fs.mkdirs(path.dirname(targetPath));
      await fs.writeFile(targetPath, file.content);
    }

    return { files: allSettingFiles, uploadedExtensions };
  }

  /**
   * Read the previously exported settings folder and return them as a list of
   * File objects, matching the shape used by the download flow.
   */
  public static async Import(
    folderPath: string,
    customSettings: CustomConfig
  ): Promise<File[]> {
    const exists = await FileService.FileExists(folderPath);
    if (!exists) {
      throw new Error(`Sync: Path "${folderPath}" does not exist.`);
    }

    const entries = await fs.readdir(folderPath);
    const files: File[] = [];
    for (const name of entries) {
      const fullPath = path.join(folderPath, name);
      if (await FileService.IsDirectory(fullPath)) {
        continue;
      }
      const content = await FileService.ReadFile(fullPath);
      const prefix = FileService.CUSTOMIZED_SYNC_PREFIX;
      let filePath: string = null;
      let fileName: string = name;
      if (name.indexOf(prefix) > -1) {
        fileName = name.split(prefix).join("");
        if (!(fileName in customSettings.customFiles)) {
          continue;
        }
        filePath = customSettings.customFiles[fileName];
      }
      files.push(new File(fileName, content, filePath, name));
    }
    return files;
  }
}
