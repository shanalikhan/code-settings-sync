import * as fs from "fs-extra";
import * as path from "path";

export interface Snapshot {
  version: 1;
  files: { [name: string]: string };
}

/** Resolve existing ancestors too, so a symlink cannot disguise a nested path. */
export async function realDestination(destination: string): Promise<string> {
  try {
    return await fs.realpath(destination);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    const parent = path.dirname(destination);
    if (parent === destination) {
      throw error;
    }
    return path.join(await realDestination(parent), path.basename(destination));
  }
}

export function destinationKey(
  destination: string,
  platform: string = process.platform
): string {
  return platform === "win32" ? destination.toLowerCase() : destination;
}

export function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    !relative ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export function validateName(name: string): void {
  const custom = name.startsWith("|customized_sync|");
  const parts = (custom ? name.slice("|customized_sync|".length) : name).split(
    "|"
  );
  if (
    (custom && parts.length !== 1) ||
    parts.some(
      part =>
        !part ||
        part === "." ||
        part === ".." ||
        /[<>\\/:"?*]/.test(part) ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
        Array.from(part).some(character => character.charCodeAt(0) < 32) ||
        [
          "__proto__",
          "constructor",
          "prototype",
          "synclocalsettings.json",
          "sync.lock",
          "globalstorage",
          "workspacestorage"
        ].includes(part.toLowerCase())
    )
  ) {
    throw new Error("Invalid settings snapshot filename: " + name);
  }
}

export function parseSnapshot(text: string): Snapshot {
  const snapshot: Snapshot = JSON.parse(text);
  if (
    !snapshot ||
    snapshot.version !== 1 ||
    !snapshot.files ||
    typeof snapshot.files !== "object" ||
    Array.isArray(snapshot.files)
  ) {
    throw new Error(
      "Unsupported settings snapshot. Expected version 1 and a files object."
    );
  }
  for (const name of Object.keys(snapshot.files)) {
    validateName(name);
    if (typeof snapshot.files[name] !== "string") {
      throw new Error("Invalid settings snapshot content: " + name);
    }
  }
  return snapshot;
}

/** One portable document; publishing it by rename avoids half-written backups. */
export class FileSystemStore {
  public readonly filename: string;

  constructor(public readonly folder: string) {
    if (!folder || !path.isAbsolute(folder)) {
      throw new Error(
        "Choose an absolute filesystem sync folder in Sync Settings."
      );
    }
    this.filename = path.join(folder, "settings-sync.json");
  }

  public async read(): Promise<string | null> {
    try {
      const stat = await fs.lstat(this.filename);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error("The settings snapshot must be a regular file.");
      }
      return await fs.readFile(this.filename, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  public async write(
    snapshot: Snapshot,
    expected: string | null
  ): Promise<void> {
    const serialized = JSON.stringify(snapshot, null, 2) + "\n";
    parseSnapshot(serialized);
    await fs.ensureDir(this.folder);
    const lockPath = path.join(this.folder, ".settings-sync.lock");
    // Refuse concurrent writers rather than silently replacing a newer backup.
    const lock = await fs.open(lockPath, "wx", 0o600);
    let temporary: string;
    try {
      if ((await this.read()) !== expected) {
        throw new Error(
          "The filesystem snapshot changed. Import it or retry the export."
        );
      }
      temporary = await fs.mkdtemp(path.join(this.folder, ".settings-sync-"));
      const staged = path.join(temporary, "snapshot.json");
      await fs.writeFile(staged, serialized, { encoding: "utf8", mode: 0o600 });
      await fs.rename(staged, this.filename);
    } finally {
      if (temporary) {
        await fs.remove(temporary);
      }
      await fs.close(lock);
      await fs.unlink(lockPath);
    }
  }
}
