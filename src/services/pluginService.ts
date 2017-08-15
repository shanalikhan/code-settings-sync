"use strict";

import * as vscode from 'vscode';
import * as util from '../common/util';
import * as path from 'path';
import { FileManager } from '../manager//fileManager';
const fs = require('fs');
const ncp = require('ncp').ncp;

var apiPath = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

const rmdir = require('rimraf');

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
        var list = JSON.parse(text);
        list.forEach(obj => {
            var meta = new ExtensionMetadata(obj.metadata.galleryApiUrl, obj.metadata.id, obj.metadata.downloadUrl, obj.metadata.publisherId, obj.metadata.publisherDisplayName, obj.metadata.date);
            var item = new ExtensionInformation();
            item.metadata = meta;
            item.name = obj.name;
            item.publisher = obj.publisher;
            item.version = obj.version;

            //Not to download this extension again and again.
            if (item.name != "code-settings-sync") {
                extList.push(item);
            }
        });
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

    public static GetMissingExtensions(remoteList: Array<ExtensionInformation>) {
        var hashset = {};

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
            if (ext.packageJSON.isBuiltin == false) {
                if (ext.packageJSON.__metadata == null) {
                    // Not install from gallery, just skip
                    continue;
                }

                var meta = ext.packageJSON.__metadata;
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

    public static async DeleteExtension(item: ExtensionInformation, ExtensionFolder: string) {
        var destination = path.join(ExtensionFolder, item.publisher + '.' + item.name + '-' + item.version);
        return new Promise((resolve, reject) => {
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
                        console.error("Sync : Extension : '"+ item.name +"' - Version : '"+ item.version+"' Not Found in marketplace. Remove the extension and upload the settings to fix this.");
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
            });
    }
}

