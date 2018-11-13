"use strict";

import * as fs from "fs-extra";
import * as path from "path";

export class File {
  constructor(
    public fileName: string,
    public content: string,
    public filePath: string,
    public gistName: string
  ) {}

  public Write(): Promise<boolean> {
    return FileService.WriteFile(this.filePath, this.content)
  }

  public ResolvePath(parentDir: string): void {
    this.filePath = parentDir + path.sep + this.fileName
  }
}
export class FileService {
  public static CUSTOMIZED_SYNC_PREFIX = "|customized_sync|";

  public static async ReadFile(filePath: string): Promise<string> {
    try {
      const data = await fs.readFile(filePath, { encoding: "utf8" });
      return data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  public static async IsDirectory(filepath: string): Promise<boolean> {
    try {
      const stat = await fs.lstat(filepath);
      return stat.isDirectory();
    } catch (err) {
      return false;
    }
  }

  public static async GetFile(
    filePath: string,
    fileName: string
  ): Promise<File> {
    const fileExists: boolean = await FileService.FileExists(filePath);

    if (!fileExists) {
      return null;
    }

    const content = await FileService.ReadFile(filePath);

    if (content === null) {
      return null;
    }

    const pathFromUser: string = filePath.substring(
      filePath.lastIndexOf("User") + 5,
      filePath.length
    );

    const arr: string[] = pathFromUser.indexOf("/")
      ? pathFromUser.split("/")
      : pathFromUser.split(path.sep);

    let gistName: string = "";

    arr.forEach((element, index) => {
      if (index < arr.length - 1) {
        gistName += element + "|";
      } else {
        gistName += element;
      }
    });

    const file: File = new File(fileName, content, filePath, gistName);
    return file;
  }

  public static async WriteFile(
    filePath: string,
    data: string
  ): Promise<boolean> {
    if (!data) {
      console.error(
        new Error(
          "Unable to write file. FilePath :" + filePath + " Data :" + data
        )
      );
      return false;
    }
    try {
      await fs.writeFile(filePath, data);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  public static async ListFiles(
    directory: string,
    depth: number,
    fullDepth: number,
    fileExtensions: string[]
  ): Promise<File[]> {
    const fileList = await fs.readdir(directory);

    const files: File[] = [];
    for (const fileName of fileList) {
      const fullPath: string = directory.concat(fileName);
      if (await FileService.IsDirectory(fullPath)) {
        if (depth < fullDepth) {
          for (const element of await FileService.ListFiles(
            fullPath + "/",
            depth + 1,
            fullDepth,
            fileExtensions
          )) {
            files.push(element);
          }
        }
      } else {
        const hasExtension: boolean = fullPath.lastIndexOf(".") > 0;
        let allowedFile: boolean = false;
        if (hasExtension) {
          const extension: string = fullPath
            .substr(fullPath.lastIndexOf(".") + 1, fullPath.length)
            .toLowerCase();
          allowedFile = fileExtensions.filter(m => m === extension).length > 0;
        } else {
          allowedFile = fileExtensions.filter(m => m === "").length > 0;
        }

        if (allowedFile) {
          const file: File = await FileService.GetFile(fullPath, fileName);
          files.push(file);
        }
      }
    }

    return files;
  }

  public static async CreateDirTree(
    userFolder: string,
    fileName: string
  ): Promise<string> {
    let fullPath: string = userFolder;
    let result: string;

    if (fileName.indexOf("|") > -1) {
      const paths: string[] = fileName.split("|");

      for (let i = 0; i < paths.length - 1; i++) {
        const element = paths[i];
        fullPath += element + "/";
        await FileService.CreateDirectory(fullPath);
      }

      result = fullPath + paths[paths.length - 1];
      return result;
    } else {
      result = fullPath + fileName;

      return result;
    }
  }

  public static async DeleteFile(filePath: string): Promise<boolean> {
    try {
      const stat: boolean = await FileService.FileExists(filePath);
      if (stat) {
        await fs.unlink(filePath);
      }
      return true;
    } catch (err) {
      console.error("Unable to delete file. File Path is :" + filePath);
      return false;
    }
  }

  public static async FileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fs.constants.F_OK);
      return true;
    } catch (err) {
      return false;
    }
  }

  public static async CreateDirectory(name: string): Promise<boolean> {
    try {
      await fs.mkdir(name);
      return true;
    } catch (err) {
      if (err.code === "EEXIST") {
        return false;
      }
      throw err;
    }
  }

  public static async GetCustomFile(
    filePath: string,
    fileName: string
  ): Promise<File> {
    const fileExists: boolean = await FileService.FileExists(filePath);

    if (!fileExists) {
      return null;
    }

    const content = await FileService.ReadFile(filePath);

    if (content === null) {
      return null;
    }

    // for identifing Customized Sync file
    const gistName: string = FileService.CUSTOMIZED_SYNC_PREFIX + fileName;

    const file: File = new File(fileName, content, filePath, gistName);
    return file;
  }

  public static async CreateCustomDirTree(filePath: string): Promise<string> {
    const dir = path.dirname(filePath);
    const fileExists = await FileService.FileExists(dir);

    if (!fileExists) {
      // mkdir recursively
      await fs.mkdirs(dir);
    }

    return filePath;
  }

  public static ExtractFileName(fullPath: string): string {
    return path.basename(fullPath);
  }

  public static ConcatPath(...filePaths: string[]): string {
    return filePaths.join(path.sep);
  }
}
