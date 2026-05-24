"use strict";

export interface GistContentFile {
  content?: string;
}

export interface GistFilesMap {
  [gistName: string]: GistContentFile;
}

export interface GistSyncFile {
  gistName: string;
  content: string;
}

export interface GistUpdatePlan<TFile extends GistSyncFile = GistSyncFile> {
  changedFiles: TFile[];
  deletedFileNames: string[];
}

export interface GistPatchFiles {
  [gistName: string]: { content: string } | null;
}

export function shouldPreserveGistFile(fileName: string): boolean {
  return fileName.startsWith("keybindings");
}

export function planGistUpdate<TFile extends GistSyncFile>(
  existingFiles: GistFilesMap,
  localFiles: TFile[]
): GistUpdatePlan<TFile> {
  const changedFiles: TFile[] = [];
  const deletedFileNames: string[] = [];
  const localFilesByGistName = new Map<string, TFile>();

  localFiles.forEach(file => {
    localFilesByGistName.set(file.gistName, file);
    const existingFile = existingFiles[file.gistName];
    if (!existingFile || existingFile.content !== file.content) {
      changedFiles.push(file);
    }
  });

  Object.keys(existingFiles).forEach(fileName => {
    if (shouldPreserveGistFile(fileName)) {
      return;
    }

    if (!localFilesByGistName.has(fileName)) {
      deletedFileNames.push(fileName);
    }
  });

  return {
    changedFiles,
    deletedFileNames
  };
}

export function buildGistPatchFiles<TFile extends GistSyncFile>(
  changedFiles: TFile[],
  deletedFileNames: string[]
): GistPatchFiles {
  const gistPatchFiles: GistPatchFiles = {};

  deletedFileNames.forEach(fileName => {
    gistPatchFiles[fileName] = null;
  });

  changedFiles.forEach(file => {
    if (file.content !== "") {
      gistPatchFiles[file.gistName] = {
        content: file.content
      };
    }
  });

  return gistPatchFiles;
}
