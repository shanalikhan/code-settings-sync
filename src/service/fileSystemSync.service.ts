import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as recursiveRead from "recursive-readdir";
import { File, FileService } from "./file.service";

const SEPARATOR = "|";

export class FileSystemSyncService {
  /**
   * Expand a leading "~" and resolve to an absolute path.
   */
  public static ResolveFolder(folder: string): string {
    if (folder === "~" || folder.startsWith("~/") || folder.startsWith("~\\")) {
      folder = path.join(os.homedir(), folder.slice(1));
    }
    return path.resolve(folder);
  }

  /**
   * Convert a gist style name (a|b.json, |customized_sync|x) to a path
   * relative to the sync folder (a/b.json, customized_sync/x).
   */
  public static ToRelativePath(gistName: string): string {
    return gistName
      .split(SEPARATOR)
      .filter(part => part !== "")
      .join("/");
  }

  /**
   * Reverse of ToRelativePath.
   */
  public static ToGistName(relativePath: string): string {
    const parts = relativePath.split(/[\\/]/);
    if (parts[0] === "customized_sync") {
      return FileService.CUSTOMIZED_SYNC_PREFIX + parts.slice(1).join("/");
    }
    return parts.join(SEPARATOR);
  }

  /**
   * Write all files into the folder. Returns the written paths.
   */
  public static async ExportFiles(
    folder: string,
    files: File[]
  ): Promise<string[]> {
    const root = FileSystemSyncService.ResolveFolder(folder);
    await fs.mkdirs(root);
    const written: string[] = [];
    for (const file of files) {
      const relative = FileSystemSyncService.ToRelativePath(file.gistName);
      const target = path.resolve(root, relative);
      if (!relative || !target.startsWith(root + path.sep)) {
        throw new Error(
          "Sync : Invalid file name for export: " + file.gistName
        );
      }
      await fs.outputFile(target, file.content);
      written.push(target);
    }
    return written;
  }

  /**
   * Read every file in the folder as a sync File.
   */
  public static async ImportFiles(folder: string): Promise<File[]> {
    const root = FileSystemSyncService.ResolveFolder(folder);
    if (!(await FileService.IsDirectory(root))) {
      throw new Error("Sync : Folder does not exist: " + root);
    }
    const paths: string[] = await recursiveRead(root);
    const files: File[] = [];
    for (const filePath of paths) {
      const gistName = FileSystemSyncService.ToGistName(
        path.relative(root, filePath)
      );
      const content = await FileService.ReadFile(filePath);
      files.push(new File(path.basename(filePath), content, null, gistName));
    }
    return files;
  }
}
