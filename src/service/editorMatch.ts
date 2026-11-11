import * as fs from "fs";
import * as path from "path";

export interface OpenDocument {
  fileName: string;
  isDirty: boolean;
}

function canonicalizeMissingPath(filePath: string): string {
  const parent = path.dirname(filePath);
  if (parent === filePath) {
    return filePath;
  }
  try {
    return path.join(fs.realpathSync(parent), path.basename(filePath));
  } catch {
    return path.join(
      canonicalizeMissingPath(parent),
      path.basename(filePath)
    );
  }
}

export function normalizeFilePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  let canonical = resolved;
  try {
    // FileService.WriteFile follows symlinks. Resolve existing paths here too
    // so a dirty document opened through the real target cannot be missed when
    // Sync reaches the same file through a symlinked settings path.
    canonical = fs.realpathSync(resolved);
  } catch {
    try {
      // A dangling symlink still aliases the path fs.writeFile will follow.
      // Resolve its link target even when the target file does not exist yet.
      const stats = fs.lstatSync(resolved);
      if (stats.isSymbolicLink()) {
        const linkTarget = path.resolve(
          path.dirname(resolved),
          fs.readlinkSync(resolved)
        );
        canonical = canonicalizeMissingPath(linkTarget);
      } else {
        canonical = canonicalizeMissingPath(resolved);
      }
    } catch {
      // Ordinary missing files can still have symlinked or partially missing
      // parents. Canonicalize the nearest existing ancestor before comparing.
      canonical = canonicalizeMissingPath(resolved);
    }
  }
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

/**
 * True when an open document for targetPath has unsaved changes. Writing the
 * file underneath such an editor makes VS Code report "The content on disk is
 * newer" and would also drop the user's unsaved edits.
 */
export function HasDirtyDocument(
  openDocuments: OpenDocument[],
  targetPath: string
): boolean {
  const target = normalizeFilePath(targetPath);
  return openDocuments.some(
    doc => doc.isDirty && normalizeFilePath(doc.fileName) === target
  );
}
