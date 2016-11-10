"use strict";
import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import * as url from 'url';
import * as fs from 'fs';

var adm_zip = require('adm-zip');
var temp = require('temp').track();
var HttpsProxyAgent = require("https-proxy-agent");
var proxy = vscode.workspace.getConfiguration("http")["proxy"] || process.env["http_proxy"];
var agent = null;
if (proxy) {
    if (proxy != '') {
        agent = new HttpsProxyAgent(proxy);
    }
}


export class Util {

    public static HttpPostJson(path: string, obj: Object, headers: Object) {
        return new Promise<string>(
            function (resolve, reject) {
                var item = url.parse(path);

                var postData = JSON.stringify(obj);
                var newHeader = {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
                Object.assign(newHeader, headers);
                var options: https.RequestOptions = {
                    host: item.hostname,
                    port: +item.port,
                    path: item.path,
                    method: 'POST',
                    headers: newHeader,

                }
                if (agent != null) {
                    options.agent = agent;
                }


                if (item.protocol.startsWith('https:')) {

                    var req = https.request(options, function (res) {
                        if (res.statusCode !== 200) {
                            //reject();
                            //return;
                        }

                        var result = '';
                        res.setEncoding('utf8');
                        res.on('data', function (chunk) {
                            result += chunk;
                        });
                        res.on('end', function () {
                            resolve(result);
                        });

                        res.on('error', function (e) {
                            reject(e);
                        });
                    });

                    req.write(postData);
                    req.end();
                } else {
                    var req = http.request(options, function (res) {
                        var result = '';
                        res.setEncoding('utf8');
                        res.on('data', function (chunk) {
                            result += chunk;
                        });
                        res.on('end', function () {
                            resolve(result);
                        });

                        res.on('error', function (e) {
                            reject(e);
                        });
                    });
                    req.write(postData);
                    req.end();
                }
            }
        )
    }
    public static HttpGetFile(path: string): Promise<string> {
        var tempFile = temp.path();
        var file = fs.createWriteStream(tempFile);
        var item = url.parse(path);
        var options: https.RequestOptions = {
            host: item.hostname,
            path: item.path
        }
        if(item.port){
            options.port = +item.port;
        }
        if (agent != null) {
            options.agent = agent;
        }
        return new Promise<string>(
            function (resolve, reject) {
                if (path.startsWith('https:')) {
                    https.get(options, function(res) {
                        
                        res.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve(tempFile);
                        })
                    }).on('error', (e) => {
                        reject(e);
                    })
                } else {
                    http.get(options, (res) => {
                        // return value
                        res.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve(tempFile);
                        })
                    }).on('error', (e) => {
                        reject(e);
                    })
                }
            }
        );
    }

    public static WriteToFile(content: Buffer): Promise<string> {
        var tempFile = temp.path();
        return new Promise<string>(
            function (resolve, reject) {
                fs.writeFile(tempFile, content, function (err) {
                    if (err) {
                        reject(err);
                    }
                    resolve(tempFile);
                });
            }
        );
    }

    public static Extract(filePath: string) {
        var dirName = temp.path();
        var zip = new adm_zip(filePath);

        return new Promise<string>(
            function (resolve, reject) {
                temp.mkdir(dirName, function (err, dirPath) {
                    try {
                        zip.extractAllTo(dirName, /*overwrite*/true);
                        resolve(dirName);
                    } catch (e) {
                        reject(e);
                    }
                });
            }
        );
    }
}