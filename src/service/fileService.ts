import { LocalConfig } from "../setting";
"use strict";
const fs = require("fs");
const path = require("path");

export class File {
  constructor(
    public fileName: string,
    public content: string,
    public filePath: string,
    public gistName: string
  ) {
    // this.fileName = file.split('.')[0];
    //this.fileName = file;
  }
}
export class FileService {
  public static async ReadFile(filePath: string): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      await fs.readFile(filePath, { encoding: "utf8" }, function(
        err: any,
        data: any
      ) {
        if (err) {
          console.error(err);
          reject(err);
        }
        resolve(data);
      });
    });
  }

  public static async IsDirectory(path: string): Promise<boolean> {
    var me: FileService = this;
    return new Promise<boolean>(async (resolve, reject) => {
      let d = await fs.lstatSync(path);
      if (d.isDirectory()) {
        resolve(true);
      }
      resolve(false);
    });
  }

  public static async GetFile(
    filePath: string,
    fileName: string
  ): Promise<File> {
    var me: FileService = this;
    return new Promise<File>(async (resolve, reject) => {
      let fileExists: boolean = await FileService.FileExists(filePath);
      if (fileExists) {
        FileService.ReadFile(filePath).then(function(content: string) {
          if (content != null) {
            let pathFromUser: string = filePath.substring(
              filePath.lastIndexOf("User") + 5,
              filePath.length
            );
            let arr = new Array<string>();
            if (pathFromUser.indexOf("/")) {
              arr = pathFromUser.split("/");
            } else {
              arr = pathFromUser.split(path.sep);
            }
            let gistName: string = "";
            arr.forEach((element, index) => {
              if (index < arr.length - 1) {
                gistName += element + "|";
              } else {
                gistName += element;
              }
            });
            var file: File = new File(fileName, content, filePath, gistName);
            resolve(file);
          }
          resolve(null);
        });
      } else {
        resolve(null);
      }
    });
  }

  public static async WriteFile(
    filePath: string,
    data: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      if (data) {
        fs.writeFile(filePath, data, err => {
          if (err) reject(false);
          else resolve(true);
        });
      } else {
        console.error(
          "Unable to write file. FilePath :" + filePath + " Data :" + data
        );
        reject(false);
      }
    });
  }

  public static async ListFiles(
    directory: string,
    depth: number,
    fullDepth: number,
    fileExtensions: Array<string>
  ): Promise<Array<File>> {
    var me = this;
    return new Promise<Array<File>>((resolve, reject) => {
      fs.readdir(directory, async function(err: any, data: Array<string>) {
        if (err) {
          console.error(err);
          resolve(null);
        }

        var files = new Array<File>();
        for (var i = 0; i < data.length; i++) {
          let fullPath: string = directory.concat(data[i]);
          let isDir: boolean = await FileService.IsDirectory(fullPath);
          if (isDir) {
            if (depth < fullDepth) {
              let filews: Array<File> = await FileService.ListFiles(
                fullPath + "/",
                depth + 1,
                fullDepth,
                fileExtensions
              );
              filews.forEach(element => {
                files.push(element);
              });
            }
          } else {
            let hasExtension: boolean =
              fullPath.lastIndexOf(".") > 0 ? true : false;
            let allowedFile: boolean = false;
            if (hasExtension) {
              let extension: string = fullPath.substr(
                fullPath.lastIndexOf(".") + 1,
                fullPath.length
              );
              extension = extension.toLowerCase();
              allowedFile =
                fileExtensions.filter(m => m == extension).length > 0
                  ? true
                  : false;
            } else {
              allowedFile =
                fileExtensions.filter(m => m == "").length > 0 ? true : false;
            }

            if (allowedFile) {
              var file: File = await FileService.GetFile(fullPath, data[i]);
              files.push(file);
            }
          }
        }
        resolve(files);
      });
    });
  }

  public static CreateDirTree(
    userFolder: string,
    fileName: string
  ): Promise<string> {
    let me: FileService = this;
    let fullPath: string = userFolder;

    return new Promise<string>(async (resolve, reject) => {
      if (fileName.indexOf("|") > -1) {
        let paths = fileName.split("|");

        for (var i = 0; i < paths.length - 1; i++) {
          var element = paths[i];
          fullPath += element + "/";
          let x = await FileService.CreateDirectory(fullPath);
        }
        console.log(fullPath + paths[paths.length - 1]);

        resolve(fullPath + paths[paths.length - 1]);
      } else {
        console.log(fullPath + fileName);

        resolve(fullPath + fileName);
      }
    });
  }

  public static async DeleteFile(filePath: string): Promise<boolean> {
    return new Promise<boolean>(async resolve => {
      if (filePath) {
        let stat: boolean = await FileService.FileExists(filePath);
        if (stat) {
          fs.unlink(filePath, err => {
            if (err) resolve(false);
            else resolve(true);
          });
        }
      } else {
        console.error("Unable to delete file. File Path is :" + filePath);
        resolve(false);
      }
    });
  }

  public static async FileExists(filePath: string): Promise<boolean> {
    return new Promise<boolean>(async resolve => {
      fs.access(filePath, fs.F_OK, err => {
        if (err) resolve(false);
        else resolve(true);
      });
    });
  }

  public static CreateDirectory(name: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      fs.mkdir(name, err => {
        if (err) reject(err);
        else resolve();
      });
    }).then(
      () => true,
      err => {
        if (err.code == "EEXIST") return false;
        else throw err;
      }
    );
  }
}
