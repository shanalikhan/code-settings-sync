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
}
export class FileService {
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
      const stat = await fs.lstatSync(filepath);
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

    if (!content) {
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
    return new Promise<File[]>((resolve, reject) => {
      fs.readdir(directory, async (err: any, data: string[]) => {
        if (err) {
          console.error(err);
          resolve(null);
        }

        const files: File[] = [];
        for (const d of data) {
          const fullPath: string = directory.concat(d);
          const isDir: boolean = await FileService.IsDirectory(fullPath);
          if (isDir) {
            if (depth < fullDepth) {
              const filews: File[] = await FileService.ListFiles(
                fullPath + "/",
                depth + 1,
                fullDepth,
                fileExtensions
              );
              filews.forEach(element => files.push(element));
            }
          } else {
            const hasExtension: boolean =
              fullPath.lastIndexOf(".") > 0 ? true : false;
            let allowedFile: boolean = false;
            if (hasExtension) {
              let extension: string = fullPath.substr(
                fullPath.lastIndexOf(".") + 1,
                fullPath.length
              );
              extension = extension.toLowerCase();
              allowedFile =
                fileExtensions.filter(m => m === extension).length > 0
                  ? true
                  : false;
            } else {
              allowedFile =
                fileExtensions.filter(m => m === "").length > 0 ? true : false;
            }

            if (allowedFile) {
              const file: File = await FileService.GetFile(fullPath, d);
              files.push(file);
            }
          }
        }
        resolve(files);
      });
    });
  }

  public static async CreateDirTree(
    userFolder: string,
    fileName: string
  ): Promise<string> {
    let fullPath: string = userFolder;
    let result: string;

    if (fileName.indexOf("|") > -1) {
      const paths: string[] = fileName.split("|");

      for (const element of paths) {
        fullPath += element + "/";
        await FileService.CreateDirectory(fullPath);
      }

      result = fullPath + paths[paths.length - 1];
      console.log(result);

      return result;
    } else {
      result = fullPath + fileName;
      console.log(result);

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
}
