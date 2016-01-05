"use strict";

import * as vscode from 'vscode';
import * as util from './util';
import * as path from 'path';

var fs = require('fs');
var ncp = require('ncp').ncp;

var apiPath = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
var ExtensionFolder: string = path.join(process.env.USERPROFILE, '.vscode', 'extensions');
    
export class ExtensionInformation{
    metadata: ExtensionMetadata;
    name: string;
    version: string;
    publisher: string;  
    
    public static fromJSON(text: string){
        var obj = JSON.parse(text);
        var meta = new ExtensionMetadata(obj.meta.galleryApiUrl, obj.meta.id, obj.meta.downloadUrl, obj.meta.publisherId, obj.meta.publisherDisplayName, obj.meta.date);
        var item = new ExtensionInformation();
        item.metadata = meta;
        item.name = obj.name;
        item.publisher = obj.publisher;
        item.version = obj.version;
        return item;
    }
    
    public static fromJSONList(text: string){
        var extList = new Array<ExtensionInformation>();
        var list = JSON.parse(text);
        list.forEach(obj => {
            var meta = new ExtensionMetadata(obj.metadata.galleryApiUrl, obj.metadata.id, obj.metadata.downloadUrl, obj.metadata.publisherId, obj.metadata.publisherDisplayName, obj.metadata.date);
            var item = new ExtensionInformation();
            item.metadata = meta;
            item.name = obj.name;
            item.publisher = obj.publisher;
            item.version = obj.version;
            extList.push(item);
        });
        
        return extList;
    }  
}

export class ExtensionMetadata{
    galleryApiUrl: string;
    id : string;
    downloadUrl: string;
    publisherId: string;
    publisherDisplayName: string; 
    date: string;
    
    constructor(galleryApiUrl: string, id: string, downloadUrl: string, publisherId: string, publisherDisplayName: string, date: string){
        this.galleryApiUrl = galleryApiUrl;
        this.id = id;
        this.downloadUrl = downloadUrl;
        this.publisherId = publisherId;
        this.publisherDisplayName = publisherDisplayName;
        this.date = date;
    }
}

export class PluginService{
    
    private static CopyExtension(destination: string, source: string){
           return new Promise(
                function(resolve, reject){
                    ncp(source, destination, function(err){
                        if(err){
                            reject(err);
                        }
                        
                        resolve();
                    })
                }); 
    }
    
    private static WritePackageJson(dirName: string, packageJson: string){
        return new Promise(
                function(resolve, reject){
                    fs.writeFile(dirName + "/extension/package.json", packageJson, "utf-8", function(error, text){
                        if(error){
                            reject(error);
                        }
                        resolve();
                    });
                });
    }
    
    private static GetPackageJson(dirName: string, item: ExtensionInformation){
            return new Promise(
                function(resolve, reject){
                    fs.readFile(dirName + "/extension/package.json", "utf-8", function(error, text){
                        if(error){
                            reject(error);
                        }
                        
                        var config = JSON.parse(text);
                        if(config.name !== item.name){
                            reject("name not equal");
                        }
                        
                        if(config.publisher !== item.publisher){
                            reject("publisher not equal");
                        }
                        
                        if(config.version !== item.version){
                            reject("version not equal");
                        }
                        
                        resolve(config);
                    });
                });
    }
    
    public static GetMissingExtensions(remoteList: Array<ExtensionInformation>){
        var hashset = {};
        
        var localList = this.CreateExtensionList();
        for(var i=0;i<localList.length;i++){
            var ext = localList[i];
            if(hashset[ext.name] == null){
                hashset[ext.name] = ext;
            }
        }
        
        var missingList = new Array<ExtensionInformation>();
        for(var i=0;i<remoteList.length;i++){
            var ext = remoteList[i];
            if(hashset[ext.name] == null){
                missingList.push(ext);
            }
        }
        
        return missingList;
    }
    
    public static CreateExtensionList(){
        var list = new Array<ExtensionInformation>();
        
        for(var i=0;i<vscode.extensions.all.length;i++){
            var ext = vscode.extensions.all[i];
            if(ext.packageJSON.isBuiltin == false){
                if(ext.packageJSON.__metadata == null){
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
    
    public static InstallExtension(item: ExtensionInformation){
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
        
        return util.Util.HttpPostJson(apiPath, data, header)
        .then(function(res){
            
            var targetVersion = null;
            var content = JSON.parse(res);
            
            // Find correct version
            for(var i=0;i<content.results.length;i++){
                var result = content.results[i];
                for(var k=0;k<result.extensions.length;k++){
                    var extension = result.extensions[k];
                    for(var j=0;j<extension.versions.length;j++){
                        var version = extension.versions[j];
                        if(version.version === item.version){
                            targetVersion = version;
                            break;
                        }
                    }
                    if(targetVersion != null){
                        break;
                    }
                }
                if(targetVersion != null){
                    break;
                }
            }
            
            if(targetVersion == null){
                // unable to find one
                throw "unable to find corresponding version of extension from gallery";
            }
            
            // Proceed to install
            var downloadUrl = targetVersion.assetUri + '/Microsoft.VisualStudio.Services.VSIXPackage?install=true'
            return downloadUrl;
        })
        .then(function(url){
            return util.Util.HttpGetFile(url);
        })
        .then(function(filePath){
            return util.Util.Extract(filePath);
        })
        .then(function(dir){
            extractPath = dir;
            return PluginService.GetPackageJson(dir, item);
        })
        .then(function(packageJson){
            Object.assign(packageJson, {
                __metadata: item.metadata
            });
            
            var text = JSON.stringify(packageJson, null, ' ');
            return PluginService.WritePackageJson(extractPath, text);
        })
        .then(function(){
            // Move the folder to correct path
            var destination = path.join(ExtensionFolder, item.publisher + '.' + item.name + '-' + item.version);
            var source = path.join(extractPath, 'extension');
            return PluginService.CopyExtension(destination, source);
        });
    }
}

