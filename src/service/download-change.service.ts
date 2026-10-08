"use strict";

import * as fs from "fs";
import * as path from "path";
import { File } from "./file.service";
import { ExtensionInformation } from "./plugin.service";

export type DownloadFileAction = "created" | "updated";

export interface IDownloadFileChange {
  action: DownloadFileAction;
  file: File;
  targetPath: string;
  content: string;
}

export interface IDownloadChangePlan {
  fileChanges: IDownloadFileChange[];
  extensionsToInstall: ExtensionInformation[];
  extensionsToRemove: ExtensionInformation[];
  hasChanges: boolean;
}

export class DownloadChangeService {
  public static CreateFileChange(
    file: File,
    targetPath: string,
    content: string,
    localContent: string | null
  ): IDownloadFileChange | null {
    if (localContent === content) {
      return null;
    }

    return {
      action: localContent === null ? "created" : "updated",
      file,
      targetPath,
      content
    };
  }

  public static CreatePlan(
    fileChanges: IDownloadFileChange[],
    extensionsToInstall: ExtensionInformation[],
    extensionsToRemove: ExtensionInformation[]
  ): IDownloadChangePlan {
    return {
      fileChanges,
      extensionsToInstall,
      extensionsToRemove,
      hasChanges:
        fileChanges.length > 0 ||
        extensionsToInstall.length > 0 ||
        extensionsToRemove.length > 0
    };
  }

  public static ResolveFilePath(userFolder: string, fileName: string): string {
    if (
      !fileName ||
      path.posix.isAbsolute(fileName) ||
      path.win32.isAbsolute(fileName) ||
      fileName.indexOf(":") !== -1 ||
      fileName.indexOf("\0") !== -1
    ) {
      throw new Error("Unsafe remote settings filename.");
    }

    const parts = fileName.split(/[|/\\]+/);
    if (parts.some(part => !part || part === "." || part === "..")) {
      throw new Error("Unsafe remote settings filename.");
    }

    const base = path.resolve(userFolder);
    const target = path.resolve(base, ...parts);
    if (target === base || !target.startsWith(base + path.sep)) {
      throw new Error("Unsafe remote settings filename.");
    }

    let current = base;
    for (const part of parts) {
      current = path.join(current, part);
      try {
        if (fs.lstatSync(current).isSymbolicLink()) {
          throw new Error("Unsafe remote settings filename.");
        }
      } catch (err) {
        if (err && (err as any).code === "ENOENT") {
          break;
        }
        throw err;
      }
    }

    return target;
  }

  public static FormatChangeSummary(plan: IDownloadChangePlan): string {
    const created = plan.fileChanges
      .filter(change => change.action === "created")
      .map(change => change.file.gistName);
    const updated = plan.fileChanges
      .filter(change => change.action === "updated")
      .map(change => change.file.gistName);
    const install = plan.extensionsToInstall.map(
      extension => `${extension.publisher}.${extension.name}`
    );
    const remove = plan.extensionsToRemove.map(
      extension => `${extension.publisher}.${extension.name}`
    );

    const lines: string[] = [
      "Sync: The following remote changes will be downloaded."
    ];

    if (created.length > 0) {
      lines.push("New: " + created.join(", "));
    }
    if (updated.length > 0) {
      lines.push("Changed: " + updated.join(", "));
    }
    if (install.length > 0) {
      lines.push("Extensions to install: " + install.join(", "));
    }
    if (remove.length > 0) {
      lines.push("Extensions to remove: " + remove.join(", "));
    }

    return lines.join("\n");
  }

  public static async ConfirmPlan(
    plan: IDownloadChangePlan,
    quietSync: boolean,
    confirm: (summary: string) => Promise<boolean>
  ): Promise<boolean> {
    if (quietSync || !plan.hasChanges) {
      return true;
    }

    return confirm(DownloadChangeService.FormatChangeSummary(plan));
  }
}
