import { randomBytes } from "crypto";
import { constants, promises as fs } from "fs";
import { join } from "path";
import {
  SyncClient,
  SyncDocument,
  SyncFile
} from "../../models/syncClient.model";

const MAX_BYTES = 64 * 1024 * 1024;

export class FileSystemStore implements SyncClient {
  public userName: string = null;
  private readonly filename: string;

  constructor(private folder: string, private allowMissing = false) {
    this.filename = join(folder, "settings-sync.json");
  }

  private ValidateFiles(files: { [key: string]: SyncFile }) {
    if (
      !files ||
      typeof files !== "object" ||
      Array.isArray(files) ||
      Object.keys(files).length > 10000
    ) {
      throw new Error("Invalid filesystem settings bundle files.");
    }
    const clean: { [key: string]: SyncFile } = Object.create(null);
    for (const key of Object.keys(files)) {
      const name = key.startsWith("|customized_sync|")
        ? key.slice("|customized_sync|".length)
        : key;
      const parts = name.split("|");
      if (
        parts.some(
          part =>
            !part ||
            part === "." ||
            part === ".." ||
            /[\\/:]/.test(part) ||
            Array.from(part).some(
              character =>
                character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
            ) ||
            /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
            [
              "__proto__",
              "prototype",
              "constructor",
              "synclocalsettings.json",
              "sync.lock"
            ].includes(part.toLowerCase())
        )
      ) {
        throw new Error("Unsafe filename in filesystem settings bundle.");
      }
      if (!files[key] || typeof files[key].content !== "string") {
        throw new Error("Invalid file content in filesystem settings bundle.");
      }
      clean[key] = { content: files[key].content };
    }
    return clean;
  }

  private async RejectSymlink() {
    try {
      const stat = await fs.lstat(this.filename);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(
          "The filesystem settings bundle must be a regular file."
        );
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  public async CreateEmptyGIST(): Promise<string> {
    return "filesystem";
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async ReadGist(_id: string): Promise<SyncDocument> {
    await this.RejectSymlink();
    let handle: AwaitedFileHandle;
    try {
      handle = await fs.open(
        this.filename,
        constants.O_RDONLY | (constants.O_NOFOLLOW || 0)
      );
    } catch (error) {
      if (error.code === "ENOENT" && this.allowMissing) {
        return {
          data: { id: "filesystem", owner: null, public: false, files: {} }
        };
      }
      throw error;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES) {
        throw new Error(
          "Filesystem settings bundle is too large or is not a file."
        );
      }
      const content = await handle.readFile({ encoding: "utf8" });
      if (Buffer.byteLength(content, "utf8") > MAX_BYTES) {
        throw new Error("Filesystem settings bundle is too large.");
      }
      const bundle = JSON.parse(content);
      if (bundle.version !== 1) {
        throw new Error("Unsupported filesystem settings bundle version.");
      }
      return {
        data: {
          id: "filesystem",
          owner: null,
          public: false,
          files: this.ValidateFiles(bundle.files)
        }
      };
    } finally {
      await handle.close();
    }
  }

  public async IsGistNewer(id: string, lastDownload: Date): Promise<boolean> {
    if (!lastDownload) {
      return false;
    }
    const document = await this.ReadGist(id);
    const metadata = document.data.files.cloudSettings;
    return metadata
      ? new Date(JSON.parse(metadata.content).lastUpload).getTime() >
          new Date(lastDownload).getTime()
      : false;
  }

  public UpdateGIST(
    document: SyncDocument,
    files: Array<{ gistName: string; content: string }>
  ): SyncDocument {
    const next: { [name: string]: SyncFile } = Object.create(null);
    for (const key of Object.keys(document.data.files)) {
      if (key.startsWith("keybindings")) {
        next[key] = document.data.files[key];
      }
    }
    for (const file of files) {
      next[file.gistName] = { content: file.content };
    }
    return {
      data: {
        id: "filesystem",
        owner: null,
        public: false,
        files: this.ValidateFiles(next)
      }
    };
  }

  public async SaveGIST(data: SyncDocument["data"]): Promise<boolean> {
    const files = this.ValidateFiles(data.files);
    const content = JSON.stringify({ version: 1, files }, null, 2);
    if (Buffer.byteLength(content, "utf8") > MAX_BYTES) {
      throw new Error("Filesystem settings bundle is too large.");
    }
    await fs.mkdir(this.folder, { recursive: true });
    const lockPath = this.filename + ".lock";
    const lock = await fs.open(lockPath, "wx", 0o600);
    let temporary: string;
    let failure: Error;
    try {
      await this.RejectSymlink();
      temporary =
        this.filename + "." + randomBytes(12).toString("hex") + ".tmp";
      await fs.writeFile(temporary, content, { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, this.filename);
      temporary = null;
    } catch (error) {
      failure = error;
    }
    const cleanup: Array<() => Promise<unknown>> = [];
    if (temporary) {
      cleanup.push(() => fs.unlink(temporary));
    }
    cleanup.push(
      () => lock.close(),
      () => fs.unlink(lockPath)
    );
    for (const action of cleanup) {
      try {
        await action();
      } catch (error) {
        if (error.code !== "ENOENT" && !failure) {
          failure = error;
        }
      }
    }
    if (failure) {
      throw failure;
    }
    return true;
  }
}

type AwaitedFileHandle = import("fs").promises.FileHandle;
