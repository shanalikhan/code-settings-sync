"use strict";

import * as vscode from 'vscode';
import * as util from '../util';
import * as path from 'path';
import { FileService } from './fileService';
import { KeyValue } from '../setting';
const fs = require('fs');
const ncp = require('ncp').ncp;

var apiPath = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

const rmdir = require('rimraf');

const extensionDir = '.vscode';

export class ExtensionInformation {
    metadata: ExtensionMetadata;
    name: string;
    version: string;
    publisher: string;

    public static fromJSON(text: string) {
        var obj = JSON.parse(text);
        var meta = new ExtensionMetadata(obj.meta.galleryApiUrl, obj.meta.id, obj.meta.downloadUrl, obj.meta.publisherId, obj.meta.publisherDisplayName, obj.meta.date);
        var item = new ExtensionInformation();
        item.metadata = meta;
        item.name = obj.name;
        item.publisher = obj.publisher;
        item.version = obj.version;
        return item;
    }

    public static fromJSONList(text: string) {
        var extList = new Array<ExtensionInformation>();
        try {
            var list = JSON.parse(text);
            list.forEach(obj => {
                var meta = new ExtensionMetadata(obj.metadata.galleryApiUrl, obj.metadata.id, obj.metadata.downloadUrl, obj.metadata.publisherId, obj.metadata.publisherDisplayName, obj.metadata.date);
                var item = new ExtensionInformation();
                item.metadata = meta;
                item.name = obj.name;
                item.publisher = obj.publisher;
                item.version = obj.version;

                if (item.name != "code-settings-sync") {
                    extList.push(item);
                }
            });
        }
        catch (err) {
            console.error("Sync : Unable to Parse extensions list", err);
        }

        return extList;
    }
}

export class ExtensionMetadata {
    galleryApiUrl: string;
    id: string;
    downloadUrl: string;
    publisherId: string;
    publisherDisplayName: string;
    date: string;

    constructor(galleryApiUrl: string, id: string, downloadUrl: string, publisherId: string, publisherDisplayName: string, date: string) {
        this.galleryApiUrl = galleryApiUrl;
        this.id = id;
        this.downloadUrl = downloadUrl;
        this.publisherId = publisherId;
        this.publisherDisplayName = publisherDisplayName;
        this.date = date;
    }
}


export class PluginService {

    public static async InstallExtensionByCLI(name: string) : Promise<boolean> {
        var exec = require('child_process').exec;
        let myExt: string = process.argv0;
        myExt = '"' + process.argv0.substr(0, process.argv0.lastIndexOf("Code")) + 'bin\\code"';
        myExt = myExt + " --install-extension " + name;
        const { stdout, stderr } = await exec(myExt);
        if (stderr) {
            console.error(`error: ${stderr}`);
            return false;
        }
        return true;
    }

    private static CopyExtension(destination: string, source: string) {
        return new Promise(
            function (resolve, reject) {
                ncp(source, destination, function (err) {
                    if (err) {
                        reject(err);
                    }
                    resolve();
                })
            });
    }
    private static WritePackageJson(dirName: string, packageJson: string) {
        return new Promise(
            function (resolve, reject) {
                fs.writeFile(dirName + "/extension/package.json", packageJson, "utf-8", function (error, text) {
                    if (error) {
                        reject(error);
                    }
                    resolve();
                });
            });
    }
    private static GetPackageJson(dirName: string, item: ExtensionInformation) {
        return new Promise(
            function (resolve, reject) {
                fs.readFile(dirName + "/extension/package.json", "utf-8", function (error, text) {
                    if (error) {
                        reject(error);
                    }
                    var config = JSON.parse(text);
                    if (config.name !== item.name) {
                        reject("name not equal");
                    }
                    if (config.publisher !== item.publisher) {
                        reject("publisher not equal");
                    }
                    if (config.version !== item.version) {
                        reject("version not equal");
                    }
                    resolve(config);
                });
            });
    }

    public static GetMissingExtensions(remoteExt: string) {
        var hashset = {};
        var remoteList = ExtensionInformation.fromJSONList(remoteExt);
        var localList = this.CreateExtensionList();
        for (var i = 0; i < localList.length; i++) {
            var ext = localList[i];
            if (hashset[ext.name] == null) {
                hashset[ext.name] = ext;
            }
        }

        var missingList = new Array<ExtensionInformation>();
        for (var i = 0; i < remoteList.length; i++) {
            var ext = remoteList[i];
            if (hashset[ext.name] == null) {
                missingList.push(ext);
            }
        }
        return missingList;
    }

    public static GetDeletedExtensions(remoteList: Array<ExtensionInformation>) {

        var localList = this.CreateExtensionList();
        var deletedList = new Array<ExtensionInformation>();

        // for (var i = 0; i < remoteList.length; i++) {

        //     var ext = remoteList[i];
        //     var found: boolean = false;

        //     for (var j = 0; j < localList.length; j++) {
        //         var localExt = localList[j];
        //         if (ext.name == localExt.name) {
        //             found = true;
        //             break;
        //         }
        //     }
        //     if (!found) {
        //         deletedList.push(localExt);
        //     }

        // }


        for (var i = 0; i < localList.length; i++) {

            var ext = localList[i];
            var found: boolean = false;
            if (ext.name != "code-settings-sync") {
                for (var j = 0; j < remoteList.length; j++) {
                    var localExt = remoteList[j];

                    if (ext.name == localExt.name) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    deletedList.push(ext);
                }
            }
        }
        return deletedList;
    }

    public static CreateExtensionList() {
        var list = new Array<ExtensionInformation>();

        for (var i = 0; i < vscode.extensions.all.length; i++) {
            var ext = vscode.extensions.all[i];
            if (ext.extensionPath.includes(extensionDir) // skip if not install from gallery
                && ext.packageJSON.isBuiltin == false
            ) {
                var meta = ext.packageJSON.__metadata || {
                    id: ext.packageJSON.uuid,
                    publisherId: ext.id,
                    publisherDisplayName: ext.packageJSON.publisher
                };
                var data = new ExtensionMetadata(meta.galleryApiUrl, meta.id, meta.downloadUrl, meta.publisherId, meta.publisherDisplayName, meta.date);
                var info = new ExtensionInformation();
                info.metadata = data;
                info.name = ext.packageJSON.name;
                info.publisher = ext.packageJSON.publisher;
                info.version = ext.packageJSON.version;
                list.push(info);
            }
        }

        return list;
    }

    public static async DeleteExtension(item: ExtensionInformation, ExtensionFolder: string): Promise<boolean> {
        var destination = path.join(ExtensionFolder, item.publisher + '.' + item.name + '-' + item.version);
        return new Promise<boolean>((resolve, reject) => {
            rmdir(destination, function (error) {
                if (error) {
                    console.log("Sync : " + "Error in uninstalling Extension.");
                    console.log(error);
                    reject(false);
                }
                resolve(true);
            });
        });
    }

    public static async DeleteExtensions(extensionsJson: string, extensionFolder: string): Promise<Array<ExtensionInformation>> {
        return await new Promise<Array<ExtensionInformation>>(async (res, rej) => {
            var remoteList = ExtensionInformation.fromJSONList(extensionsJson);
            var deletedList = PluginService.GetDeletedExtensions(remoteList);
            let deletedExt: Array<ExtensionInformation> = new Array<ExtensionInformation>();
            if (deletedList.length == 0) {
                res(deletedExt);
            }
            for (var deletedItemIndex = 0; deletedItemIndex < deletedList.length; deletedItemIndex++) {

                var selectedExtension = deletedList[deletedItemIndex];
                let extStatus: ExtensionInformation;
                try {
                    let status: boolean = await PluginService.DeleteExtension(selectedExtension, extensionFolder);
                    deletedExt.push(selectedExtension);

                } catch (err) {
                    console.error("Sync : Unable to delete extension " + selectedExtension.name + " " + selectedExtension.version);
                    console.error(err);
                    rej(deletedExt);
                }
            }
            res(deletedExt);
        });
    }

    public static async InstallExtensions(extensions: string, extFolder: string, notificationCallBack: Function): Promise<Array<ExtensionInformation>> {
        return new Promise<Array<ExtensionInformation>>(async (res, rej) => {
            var missingList = PluginService.GetMissingExtensions(extensions);
            if (missingList.length == 0) {
                notificationCallBack("Sync : No Extensions needs to be installed.");
                res(new Array<ExtensionInformation>());
            }
            let actionList: Array<Promise<void>> = new Array<Promise<void>>();
            let addedExtensions: Array<ExtensionInformation> = new Array<ExtensionInformation>();
            var totalInstalled: number = 0;
            await missingList.forEach(async (element, index) => {
                (function (ext: ExtensionInformation, folder: string) {
                    actionList.push(PluginService.InstallExtension(element, extFolder).then(function () {
                        totalInstalled = totalInstalled + 1;
                        notificationCallBack("Sync : Extension " + totalInstalled + " of " + missingList.length.toString() + " installed.", false);
                        addedExtensions.push(element);
                    }, function (err: any) {
                        console.error(err);
                        notificationCallBack("Sync : " + element.name + " Download Failed.", true);
                    }));
                }(element, extFolder));

            });
            Promise.all(actionList).then(function () {
                res(addedExtensions);
            }, function () {
                rej(addedExtensions);
            });
        });
    }

    public static async InstallExtension(item: ExtensionInformation, ExtensionFolder: string) {
        var header = {
            'Accept': 'application/json;api-version=3.0-preview.1'
        };
        var extractPath = null;

        var data = {
            'filters': [{
                'criteria': [{
                    'filterType': 4,
                    'value': item.metadata.id
                }]
            }],
            flags: 133
        };

        return await util.Util.HttpPostJson(apiPath, data, header)
            .then(function (res) {
                try {
                    var targetVersion = null;
                    var content = JSON.parse(res);

                    // Find correct version
                    for (var i = 0; i < content.results.length; i++) {
                        var result = content.results[i];
                        for (var k = 0; k < result.extensions.length; k++) {
                            var extension = result.extensions[k];
                            for (var j = 0; j < extension.versions.length; j++) {
                                var version = extension.versions[j];
                                if (version.version === item.version) {
                                    targetVersion = version;
                                    break;
                                }
                            }
                            if (targetVersion != null) {
                                break;
                            }
                        }
                        if (targetVersion != null) {
                            break;
                        }
                    }

                    if (targetVersion == null || !targetVersion.assetUri) {
                        // unable to find one
                        throw "NA";
                    }

                    // Proceed to install
                    var downloadUrl = targetVersion.assetUri + '/Microsoft.VisualStudio.Services.VSIXPackage?install=true';
                    console.log("Installing from Url :" + downloadUrl);

                    return downloadUrl;
                } catch (error) {
                    if (error == "NA") {
                        console.error("Sync : Extension : '" + item.name + "' - Version : '" + item.version + "' Not Found in marketplace. Remove the extension and upload the settings to fix this.");
                    }
                    console.error(error);
                    // console.log("Response :");
                    // console.log(res);
                }

            })
            .then(function (url) {
                return util.Util.HttpGetFile(url);
            })
            .then(function (filePath) {
                return util.Util.Extract(filePath);
            })
            .then(function (dir) {
                extractPath = dir;
                return PluginService.GetPackageJson(dir, item);
            })
            .then(function (packageJson) {
                Object.assign(packageJson, {
                    __metadata: item.metadata
                });

                var text = JSON.stringify(packageJson, null, ' ');
                return PluginService.WritePackageJson(extractPath, text);
            })
            .then(function () {
                // Move the folder to correct path
                var destination = path.join(ExtensionFolder, item.publisher + '.' + item.name + '-' + item.version);
                var source = path.join(extractPath, 'extension');
                return PluginService.CopyExtension(destination, source);
            })
            .catch(function (error) {
                console.error("Sync : Extension : '" + item.name + "' - Version : '" + item.version + "' " + error);
                throw error;
            });
    }
}

