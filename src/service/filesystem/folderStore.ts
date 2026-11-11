import * as fs from "fs-extra";
import { randomBytes } from "crypto";
import * as path from "path";

/**
 * A settings file, named the way GistService names gist files:
 * "settings.json", "snippets|go.json", "|customized_sync|.eslintrc".
 */
export interface FolderFile {
  name: string;
  content: string;
}

/** Same shape as the gist "cloudSettings" file, plus the names written by the last export. */
export interface FolderMetadata {
  lastUpload: Date | string;
  extensionVersion?: string;
  files?: string[];
}

export interface FolderFilter {
  ignoreUploadFiles: string[];
  ignoreUploadFolders: string[];
  supportedFileExtensions: string[];
}

export type FolderProblem = "notSet" | "notAbsolute" | "overlapsUserFolder";

export const METADATA_FILE = "cloudSettings";
export const CUSTOM_PREFIX = "|customized_sync|";
export const CUSTOM_FOLDER = "customized_sync";
export const KEYBINDINGS = "keybindings.json";
export const KEYBINDINGS_MAC = "keybindingsMac.json";
export const LOCK_FILE = ".settings-sync.lock";
const TEMP_SUFFIX = ".sync-tmp";

function IsForeignKeybinding(
  name: string,
  managedKeybinding?: string
): boolean {
  return (
    (name === KEYBINDINGS || name === KEYBINDINGS_MAC) &&
    name !== managedKeybinding
  );
}
/** A lock older than this was left behind by an export that crashed. */
const STALE_LOCK_MS = 2 * 60 * 1000;

/** Maps a sync file name to a path relative to the sync folder. Throws on names that could escape it. */
export function ToRelativePath(name: string): string {
  const parts = name.startsWith(CUSTOM_PREFIX)
    ? [CUSTOM_FOLDER, name.slice(CUSTOM_PREFIX.length)]
    : name.split("|");
  const invalid = parts.some(
    part =>
      !part ||
      part === "." ||
      part === ".." ||
      /[\\/]/.test(part) ||
      part.includes("\0")
  );
  if (invalid) {
    throw new Error(`Sync: Invalid settings file name "${name}".`);
  }
  return path.join(...parts);
}

/** Canonical relative destination identity for cross-OS collision checks. */
export function DestinationKey(relativePath: string): string {
  return relativePath
    .split(path.sep)
    .join("/")
    .normalize("NFC")
    .toLowerCase();
}

/** Inverse of ToRelativePath. */
export function ToFileName(relativePath: string): string {
  const parts = relativePath.split(/[\\/]/);
  if (parts.length === 2 && parts[0] === CUSTOM_FOLDER) {
    return CUSTOM_PREFIX + parts[1];
  }
  return parts.join("|");
}

export function IsInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}

/** Resolves symbolic links in the part of the path that already exists. */
export async function RealPath(target: string): Promise<string> {
  const resolved = path.resolve(target);
  try {
    return await fs.realpath(resolved);
  } catch (err) {
    const parent = path.dirname(resolved);
    if (err.code !== "ENOENT" || parent === resolved) {
      throw err;
    }
    return path.join(await RealPath(parent), path.basename(resolved));
  }
}

/**
 * The sync folder must be an absolute path that neither contains nor sits
 * inside the VS Code user folder, otherwise an export would copy into itself.
 */
export async function CheckFolder(
  folder: string,
  userFolder: string
): Promise<FolderProblem | null> {
  if (!folder || !folder.trim()) {
    return "notSet";
  }
  if (!path.isAbsolute(folder.trim())) {
    return "notAbsolute";
  }
  const [sync, user] = await Promise.all([
    RealPath(folder.trim()),
    RealPath(userFolder)
  ]);
  if (IsInside(sync, user) || IsInside(user, sync)) {
    return "overlapsUserFolder";
  }
  return null;
}

/** Name used in the folder for a file listed from the user folder (mirrors the gist upload). */
export function ExportName(
  name: string,
  isMac: boolean,
  universalKeybindings: boolean
): string {
  if (name === KEYBINDINGS && isMac && !universalKeybindings) {
    return KEYBINDINGS_MAC;
  }
  return name;
}

/**
 * Name to write in the user folder for a file read from the sync folder,
 * or null when this OS should skip it (mirrors the gist download).
 */
export function ImportName(
  name: string,
  isMac: boolean,
  universalKeybindings: boolean
): string | null {
  const macKeybindings = isMac && !universalKeybindings;
  if (name === KEYBINDINGS_MAC) {
    return macKeybindings ? KEYBINDINGS : null;
  }
  if (name === KEYBINDINGS) {
    return macKeybindings ? null : KEYBINDINGS;
  }
  return name;
}

function Time(value: Date | string | null | undefined): number {
  return value ? new Date(value).getTime() : NaN;
}

/** True when the folder holds the export this machine last imported or wrote. */
export function IsUpToDate(
  metadata: FolderMetadata | null,
  lastDownload: Date | string | null,
  lastUpload: Date | string | null
): boolean {
  const exported = Time(metadata && metadata.lastUpload);
  return (
    !isNaN(exported) &&
    (exported === Time(lastDownload) || exported === Time(lastUpload))
  );
}

/** True when another export reached the folder after this machine last imported or exported. */
export function HasNewerExport(
  metadata: FolderMetadata | null,
  lastDownload: Date | string | null,
  lastUpload: Date | string | null
): boolean {
  const exported = Time(metadata && metadata.lastUpload);
  if (isNaN(exported) || IsUpToDate(metadata, lastDownload, lastUpload)) {
    return false;
  }
  const known = Math.max(Time(lastDownload) || 0, Time(lastUpload) || 0);
  return exported > known;
}

/** Glob match for ignoreUploadFiles entries: "*" and "?" wildcards, matched on the file name. */
export function MatchesPattern(relativePath: string, pattern: string): boolean {
  const subject = pattern.includes("/")
    ? relativePath.split(path.sep).join("/")
    : path.basename(relativePath);
  const expression = pattern
    .split("")
    .map(character =>
      character === "*"
        ? "[^/]*"
        : character === "?"
        ? "[^/]"
        : character.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    )
    .join("");
  return new RegExp(`^${expression}$`).test(subject);
}

/** A plain folder (for example inside OneDrive or Dropbox) holding exported settings files. */
export class FolderStore {
  constructor(public readonly folder: string) {}

  public async ReadMetadata(): Promise<FolderMetadata | null> {
    const content = await this.ReadFile(METADATA_FILE);
    if (content === null) {
      return null;
    }
    let metadata: FolderMetadata;
    try {
      metadata = JSON.parse(content);
    } catch (err) {
      metadata = null;
    }
    if (!metadata || typeof metadata !== "object") {
      throw new Error(
        `Sync: ${path.join(this.folder, METADATA_FILE)} is not valid JSON.`
      );
    }
    return metadata;
  }

  /** Reads a file by sync name. Returns null when it is missing or is not a regular file. */
  public async ReadFile(name: string): Promise<string | null> {
    const target = path.join(this.folder, ToRelativePath(name));
    let stats: fs.Stats;
    try {
      stats = await fs.lstat(target);
    } catch (err) {
      if (err.code === "ENOENT" || err.code === "ENOTDIR") {
        return null;
      }
      throw err;
    }
    if (
      !stats.isFile() ||
      !IsInside(await fs.realpath(this.folder), await fs.realpath(target))
    ) {
      return null;
    }
    return fs.readFile(target, "utf8");
  }

  /**
   * Lists the settings files in the folder with the same rules FileService.ListFiles
   * applies to the user folder. Symbolic links are never followed and the
   * customized_sync folder is left to ReadFile.
   */
  public async ListFiles(filter: FolderFilter): Promise<FolderFile[]> {
    const files: FolderFile[] = [];
    if (!(await fs.pathExists(this.folder))) {
      return files;
    }
    const walk = async (relativeFolder: string): Promise<void> => {
      const entries = (
        await fs.readdir(path.join(this.folder, relativeFolder))
      ).sort();
      for (const entry of entries) {
        const relative = path.join(relativeFolder, entry);
        const stats = await fs.lstat(path.join(this.folder, relative));
        if (
          stats.isSymbolicLink() ||
          filter.ignoreUploadFiles.some(pattern =>
            MatchesPattern(relative, pattern)
          )
        ) {
          continue;
        }
        if (stats.isDirectory()) {
          if (
            relative !== CUSTOM_FOLDER &&
            !filter.ignoreUploadFolders.includes(entry)
          ) {
            await walk(relative);
          }
          continue;
        }
        if (
          stats.isFile() &&
          !entry.endsWith(TEMP_SUFFIX) &&
          filter.supportedFileExtensions.includes(path.extname(entry).slice(1))
        ) {
          files.push({
            name: ToFileName(relative),
            content: await fs.readFile(path.join(this.folder, relative), "utf8")
          });
        }
      }
    };
    await walk("");
    return files;
  }

  /**
   * True when any of the files is missing from the folder or has different
   * content, or when the previous export wrote a file that is no longer exported.
   */
  public async HasChanges(
    files: FolderFile[],
    previous: FolderMetadata = null,
    managedKeybinding?: string
  ): Promise<boolean> {
    const names = new Set(files.map(file => file.name));
    const removed =
      previous &&
      Array.isArray(previous.files) &&
      previous.files.some(
        name =>
          typeof name === "string" &&
          !names.has(name) &&
          !IsForeignKeybinding(name, managedKeybinding)
      );
    if (removed) {
      return true;
    }
    for (const file of files) {
      if ((await this.ReadFile(file.name)) !== file.content) {
        return true;
      }
    }
    return false;
  }

  /**
   * Writes every file (each one atomically), removes files that the previous
   * export wrote but this one did not, then writes the metadata file last.
   * The other OS's keybinding file is kept, while a deleted keybinding managed
   * by this exporter is removed, matching how the gist upload treats them.
   *
   * The work happens under a lock file so two machines exporting to a shared
   * folder cannot interleave. When `expected` (the metadata the caller compared
   * against) is given, the write is refused if another export landed since.
   */
  public async Write(
    files: FolderFile[],
    metadata: FolderMetadata,
    expected?: FolderMetadata | null,
    managedKeybinding?: string
  ): Promise<void> {
    await fs.ensureDir(this.folder);
    const root = await fs.realpath(this.folder);
    const lease = await this.Lock(root);
    try {
      await lease.assertOwned();
      await this.WriteLocked(
        root,
        files,
        metadata,
        expected,
        lease.assertOwned,
        managedKeybinding
      );
    } finally {
      await lease.release();
    }
  }

  private async Lock(root: string): Promise<{
    assertOwned: () => Promise<void>;
    renew: () => Promise<void>;
    release: () => Promise<void>;
  }> {
    const lockPath = path.join(root, LOCK_FILE);
    const busy = () =>
      new Error(`Sync: Another export to ${this.folder} is in progress. Try again in a moment.`);
    let handle: number;
    try {
      handle = await fs.open(lockPath, "wx");
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const first = await fs.lstat(lockPath).catch(() => null);
      if (!first || !first.isFile() || Date.now() - first.mtimeMs < STALE_LOCK_MS) {
        throw busy();
      }
      // Confirm that the stale file did not renew or change ownership while
      // we examined it. A live exporter refreshes its open inode periodically.
      const again = await fs.lstat(lockPath).catch(() => null);
      if (!again || !again.isFile() || Date.now() - again.mtimeMs < STALE_LOCK_MS ||
          again.dev !== first.dev || again.ino !== first.ino ||
          again.mtimeMs !== first.mtimeMs || again.size !== first.size) {
        throw busy();
      }
      await fs.unlink(lockPath);
      try {
        handle = await fs.open(lockPath, "wx");
      } catch (createError) {
        if (createError.code === "EEXIST") throw busy();
        throw createError;
      }
    }

    // A random owner token plus the open inode distinguish this exporter from
    // a replacement lease. Never remove another writer's lock on release.
    const token = randomBytes(16).toString("hex");
    try {
      await fs.writeFile(lockPath, token, "utf8");
    } catch (err) {
      await fs.close(handle);
      throw err;
    }
    const opened = await fs.fstat(handle);
    let released = false;
    let lost = false;
    const ownsLock = async (): Promise<boolean> => {
      if (released) return false;
      try {
        const [current, body] = await Promise.all([
          fs.lstat(lockPath), fs.readFile(lockPath, "utf8")
        ]);
        return current.isFile() && current.dev === opened.dev &&
          current.ino === opened.ino && body === token;
      } catch (err) {
        return false;
      }
    };
    const assertOwned = async (): Promise<void> => {
      if (lost || !(await ownsLock())) {
        throw new Error("Sync: Export lock ownership was lost; refusing concurrent settings writes.");
      }
    };
    const renew = async (): Promise<void> => {
      if (released || lost) return;
      if (!(await ownsLock())) { lost = true; return; }
      try {
        // Touch the opened inode, not a path another process may replace.
        const now = new Date();
        await fs.futimes(handle, now, now);
        if (!(await ownsLock())) lost = true;
      } catch (err) {
        lost = true;
      }
    };
    let pending = Promise.resolve();
    const heartbeat = setInterval(() => {
      pending = pending.then(renew).catch(() => { lost = true; });
    }, STALE_LOCK_MS / 4);
    if ((heartbeat as any).unref) (heartbeat as any).unref();
    const release = async (): Promise<void> => {
      clearInterval(heartbeat);
      await pending;
      const owned = await ownsLock();
      released = true;
      try {
        await fs.close(handle);
      } finally {
        // A stale exporter may have been superseded. Do not delete that
        // later exporter's live lock when the older operation finishes.
        if (owned && (await fs.readFile(lockPath, "utf8").catch(() => null)) === token) {
          await fs.remove(lockPath);
        }
      }
    };
    return { assertOwned, renew, release };
  }

  private async WriteLocked(
    root: string,
    files: FolderFile[],
    metadata: FolderMetadata,
    expected: FolderMetadata | null | undefined,
    assertOwned: () => Promise<void>,
    managedKeybinding?: string
  ): Promise<void> {
    await assertOwned();
    let previous: FolderMetadata = null;
    try {
      previous = await this.ReadMetadata();
    } catch (err) {
      previous = null;
    }
    const stamp = (value: FolderMetadata | null) =>
      value && value.lastUpload
        ? String(new Date(value.lastUpload).getTime())
        : "";
    if (expected !== undefined && stamp(previous) !== stamp(expected)) {
      throw new Error(
        `Sync: Another machine exported to ${this.folder} during this export. Run the export again.`
      );
    }
    // Reject the *whole* proposed export before publishing a single file.
    // A late duplicate/invalid entry must not leave partial new settings
    // next to the previous, still-authoritative cloudSettings manifest.
    const names = new Set<string>();
    const destinations = new Set<string>();
    const prepared: Array<{ relative: string; content: string }> = [];
    for (const file of files) {
      if (!file || typeof file.name !== "string" ||
          typeof file.content !== "string") {
        throw new Error("Sync: Invalid settings export entry.");
      }
      const relative = ToRelativePath(file.name);
      // Different manifest names may normalize to one destination, e.g.
      // customized_sync|foo vs |customized_sync|foo. Case and Unicode
      // folding also prevent cross-OS folder collisions.
      const destination = DestinationKey(relative);
      if (file.name === METADATA_FILE || names.has(file.name) ||
          destinations.has(destination)) {
        throw new Error(`Sync: Duplicate or reserved settings file name "${file.name}".`);
      }
      names.add(file.name);
      destinations.add(destination);
      prepared.push({ relative, content: file.content });
    }
    for (const file of prepared) {
      await assertOwned();
      await this.WriteAtomic(root, file.relative, file.content, assertOwned);
      await assertOwned();
    }
    const stale =
      previous && Array.isArray(previous.files) ? previous.files : [];
    for (const name of stale) {
      await assertOwned();
      if (typeof name !== "string" || names.has(name)) {
        continue;
      }
      if (IsForeignKeybinding(name, managedKeybinding)) {
        // Import uses this manifest as its authority. Retaining the other
        // OS's file on disk also requires retaining its manifest entry.
        // Do not advertise a missing file: imports reject incomplete exports.
        if ((await this.ReadFile(name)) !== null) {
          names.add(name);
        }
        continue;
      }
      let target: string;
      try {
        target = path.join(root, ToRelativePath(name));
      } catch (err) {
        continue;
      }
      const stats = await fs.lstat(target).catch(() => null);
      if (
        stats &&
        stats.isFile() &&
        IsInside(root, await fs.realpath(path.dirname(target)))
      ) {
        await assertOwned();
        await fs.remove(target);
      }
    }
    await assertOwned();
    await this.WriteAtomic(
      root,
      METADATA_FILE,
      JSON.stringify({ ...metadata, files: Array.from(names).sort() }, null, 2),
      assertOwned
    );
    await assertOwned();
  }

  private async WriteAtomic(
    root: string,
    relative: string,
    content: string,
    assertOwned: () => Promise<void>
  ): Promise<void> {
    const target = path.join(root, relative);
    await fs.ensureDir(path.dirname(target));
    if (!IsInside(root, await fs.realpath(path.dirname(target)))) {
      throw new Error(`Sync: Refusing to write outside ${root}: ${relative}`);
    }
    const temporary = `${target}.${process.pid}.${Date.now()}${TEMP_SUFFIX}`;
    try {
      await fs.writeFile(temporary, content, "utf8");
      // Remote folders can block for long periods while writing a temporary
      // file. Another machine can acquire a replacement lease meanwhile.
      // Recheck right before publication, not only before/after this method:
      // an after-write check cannot undo an already-overwritten settings file.
      await assertOwned();
      await fs.rename(temporary, target);
    } finally {
      await fs.remove(temporary);
    }
  }
}
