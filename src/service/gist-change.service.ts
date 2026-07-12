"use strict";

import { File } from "./file.service";

export type GistChangeAction = "created" | "updated" | "deleted";

export interface IGistChange {
  action: GistChangeAction;
  fileName: string;
}

export interface IGistChangePlan {
  changes: IGistChange[];
  filesToDelete: string[];
  filesToUpload: File[];
  hasChanges: boolean;
}

export class GistChangeService {
  public static CreatePlan(
    remoteFiles: any,
    localFiles: File[],
    forceUpload: boolean = false
  ): IGistChangePlan {
    const remote = remoteFiles || {};
    const localByGistName: { [key: string]: File } = {};
    const changes: IGistChange[] = [];
    const filesToDelete: string[] = [];
    const filesToUpload: File[] = [];
    let cloudSettingsFile: File = null;

    for (const file of localFiles) {
      if (!file || !file.gistName) {
        continue;
      }
      localByGistName[file.gistName] = file;
      if (file.gistName === "cloudSettings") {
        cloudSettingsFile = file;
      }
    }

    for (const file of localFiles) {
      if (!file || !file.gistName || file.content === "") {
        continue;
      }
      if (file.gistName === "cloudSettings") {
        continue;
      }

      const remoteFile = remote[file.gistName];
      if (!remoteFile) {
        changes.push({ action: "created", fileName: file.gistName });
        filesToUpload.push(file);
      } else if (remoteFile.content !== file.content) {
        changes.push({ action: "updated", fileName: file.gistName });
        filesToUpload.push(file);
      } else if (forceUpload) {
        filesToUpload.push(file);
      }
    }

    for (const fileName of Object.keys(remote)) {
      if (
        !localByGistName[fileName] &&
        !GistChangeService.IsRemoteFilePreserved(fileName)
      ) {
        changes.push({ action: "deleted", fileName });
        filesToDelete.push(fileName);
      }
    }

    if (
      cloudSettingsFile &&
      cloudSettingsFile.content !== "" &&
      (changes.length > 0 || forceUpload)
    ) {
      filesToUpload.push(cloudSettingsFile);
    }

    return {
      changes,
      filesToDelete,
      filesToUpload,
      hasChanges: changes.length > 0
    };
  }

  public static CreatePatchFiles(plan: IGistChangePlan): any {
    const files = {};

    for (const fileName of plan.filesToDelete) {
      files[fileName] = null;
    }

    for (const file of plan.filesToUpload) {
      if (file.content !== "") {
        files[file.gistName] = {
          content: file.content
        };
      }
    }

    return files;
  }

  public static FormatChangeSummary(plan: IGistChangePlan): string {
    const created = GistChangeService.GetFilesByAction(plan, "created");
    const updated = GistChangeService.GetFilesByAction(plan, "updated");
    const deleted = GistChangeService.GetFilesByAction(plan, "deleted");
    const message: string[] = [
      "Sync: The following local changes will be uploaded."
    ];

    if (created.length > 0) {
      message.push("New: " + created.join(", "));
    }
    if (updated.length > 0) {
      message.push("Changed: " + updated.join(", "));
    }
    if (deleted.length > 0) {
      message.push("Deleted: " + deleted.join(", "));
    }

    return message.join("\n");
  }

  private static GetFilesByAction(
    plan: IGistChangePlan,
    action: GistChangeAction
  ): string[] {
    return plan.changes
      .filter(change => change.action === action)
      .map(change => change.fileName);
  }

  private static IsRemoteFilePreserved(fileName: string): boolean {
    return fileName.startsWith("keybindings");
  }
}
