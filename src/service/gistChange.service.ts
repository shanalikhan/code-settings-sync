"use strict";

import { File } from "./file.service";

export interface IGistFileMap {
  [fileName: string]: {
    content?: string;
  };
}

export class GistChangeService {
  public static GetChangedSettingFiles(
    allSettingFiles: File[],
    gistFiles: IGistFileMap
  ): File[] {
    return allSettingFiles.filter(fileToUpload => {
      if (fileToUpload.gistName === "cloudSettings") {
        return false;
      }
      if (!gistFiles[fileToUpload.gistName]) {
        return true;
      }
      return gistFiles[fileToUpload.gistName].content !== fileToUpload.content;
    });
  }

  public static GetFilesToUpload(
    allSettingFiles: File[],
    gistFiles: IGistFileMap,
    forceUpload: boolean
  ): File[] {
    if (forceUpload) {
      return allSettingFiles;
    }

    const changedSettingFiles = GistChangeService.GetChangedSettingFiles(
      allSettingFiles,
      gistFiles
    );

    return allSettingFiles.filter(fileToUpload => {
      return (
        fileToUpload.gistName === "cloudSettings" ||
        changedSettingFiles.some(
          changedFile => changedFile.gistName === fileToUpload.gistName
        )
      );
    });
  }
}
