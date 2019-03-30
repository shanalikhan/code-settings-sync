"use strict";

import * as fs from "fs-extra";
import * as $path from "path";

export class File {
  constructor(
    public filename: string,
    public content: string,
    public path: string,
    public gistName: string
  ) {}
}
export class FileService {
  public static CUSTOMIZED_SYNC_PREFIX = "|customized_sync|";

  public static ReadFile(path: string): string {
    try {
      return fs.readFileSync(path, { encoding: "utf8" });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  public static IsDirectory(path: string): boolean {
    try {
      return fs.lstatSync(path).isDirectory();
    } catch (err) {
      return false;
    }
  }

  public static GetFile(path: string): File {
    if (FileService.FileExists(path)) {
      return null;
    }

    const content = FileService.ReadFile(path);

    if (content === null) {
      return null;
    }

    const pathFromUser: string = path.substring(
      path.lastIndexOf("User") + 5,
      path.length
    );

    const arr: string[] = pathFromUser.indexOf("/")
      ? pathFromUser.split("/")
      : pathFromUser.split($path.sep);

    let gistName: string = "";

    arr.forEach((element, index) => {
      if (index < arr.length - 1) {
        gistName += element + "|";
      } else {
        gistName += element;
      }
    });

    return new File(this.ExtractFileName(path), content, path, gistName);
  }

  public static WriteFile(path: string, data: string): boolean {
    if (!data) {
      console.error(
        new Error("Unable to write file. FilePath :" + path + " Data :" + data)
      );
      return false;
    }
    try {
      fs.writeFileSync(path, data);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  public static ListFiles(
    directory: string,
    depth: number,
    fullDepth: number,
    fileExtensions: string[]
  ): File[] {
    const fileList = fs.readdirSync(directory);

    const files: File[] = [];
    for (const fileName of fileList) {
      const path: string = directory.concat(fileName);
      if (FileService.IsDirectory(path)) {
        if (depth < fullDepth) {
          for (const element of FileService.ListFiles(
            path + "/",
            depth + 1,
            fullDepth,
            fileExtensions
          )) {
            files.push(element);
          }
        }
      } else {
        const hasExtension: boolean = path.lastIndexOf(".") > 0;
        let allowedFile: boolean = false;
        if (hasExtension) {
          const extension: string = path
            .substr(path.lastIndexOf(".") + 1, path.length)
            .toLowerCase();
          allowedFile = fileExtensions.filter(m => m === extension).length > 0;
        } else {
          allowedFile = fileExtensions.filter(m => m === "").length > 0;
        }

        if (allowedFile) {
          files.push(FileService.GetFile(path));
        }
      }
    }

    return files;
  }

  public static async CreateDirTree(
    userFolder: string,
    fileName: string
  ): Promise<string> {
    let path: string = userFolder;
    let result: string;

    if (fileName.indexOf("|") > -1) {
      const paths: string[] = fileName.split("|");

      for (let i = 0; i < paths.length - 1; i++) {
        const element = paths[i];
        path += element + "/";
        await FileService.CreateDirectory(path);
      }

      result = path + paths[paths.length - 1];
      return result;
    } else {
      result = path + fileName;

      return result;
    }
  }

  public static DeleteFile(path: string): boolean {
    try {
      const stat: boolean = FileService.FileExists(path);
      if (stat) {
        fs.unlinkSync(path);
      }
      return true;
    } catch (err) {
      console.error("Unable to delete file. File Path is :" + path);
      return false;
    }
  }

  public static FileExists(path: string): boolean {
    try {
      fs.accessSync(path, fs.constants.F_OK);
      return true;
    } catch (err) {
      return false;
    }
  }

  public static GetCustomFile(path: string): File {
    const fileExists = FileService.FileExists(path);

    if (!fileExists) {
      return null;
    }

    const content = FileService.ReadFile(path);

    if (content === null) {
      return null;
    }

    const filename = this.ExtractFileName(path);
    const gistName: string = FileService.CUSTOMIZED_SYNC_PREFIX + filename;

    return new File(filename, content, path, gistName);
  }

  public static CreateDirectory(name: string): boolean {
    try {
      fs.mkdirSync(name);
      return true;
    } catch (err) {
      if (err.code === "EEXIST") {
        return false;
      }
      throw err;
    }
  }

  public static CreateCustomDirTree(filePath: string): string {
    const dir = $path.dirname(filePath);
    const fileExists = FileService.FileExists(dir);

    if (!fileExists) {
      fs.mkdirsSync(dir);
    }
    return filePath;
  }

  public static ExtractFileName(fullPath: string): string {
    return $path.basename(fullPath);
  }

  public static ConcatPath(...filePaths: string[]): string {
    return filePaths.join($path.sep);
  }
}
