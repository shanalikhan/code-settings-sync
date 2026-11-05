"use strict";

const Module = require("module");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const Mocha = require("mocha");

const root = path.resolve(__dirname, "..");
const panels = [];
const vscode = {
  __filesystemTest: true,
  __folders: undefined,
  panels,
  ViewColumn: { One: 1 },
  extensions: { all: [], getExtension: () => ({ extensionPath: root }) },
  window: {
    setStatusBarMessage: () => ({ dispose() {} }),
    showInformationMessage: async (message, ...items) => items[0],
    showErrorMessage: async () => undefined,
    showOpenDialog: async () => vscode.__folders,
    createWebviewPanel: () => {
      const panel = {
        webview: {
          html: "",
          onDidReceiveMessage(callback) {
            panel.receive = callback;
          }
        },
        onDidDispose() {},
        reveal() {}
      };
      panels.push(panel);
      return panel;
    }
  },
  commands: { executeCommand: async () => undefined },
  Uri: {
    file: filename => ({
      fsPath: filename,
      with() {
        return this;
      },
      toString: () => pathToFileURL(filename).toString()
    }),
    parse: value => value
  }
};
const original = Module._load;
Module._load = function(id, parent, isMain) {
  return id === "vscode" ? vscode : original.call(this, id, parent, isMain);
};
const denyNetwork = () => {
  throw new Error("Network is forbidden in filesystem sync tests");
};
require("http").request = denyNetwork;
require("https").request = denyNetwork;
global.fetch = denyNetwork;
process.env.VSCODE_NLS_CONFIG = '{"locale":"en"}';
process.env.SETTINGS_SYNC_FILESYSTEM_TEST = "1";
const mocha = new Mocha({ timeout: 10000 });
const tests = path.join(root, "out/test/service/filesystem");
for (const file of fs.readdirSync(tests)) {
  if (file.endsWith(".test.js")) mocha.addFile(path.join(tests, file));
}
mocha.run(failures => {
  Module._load = original;
  process.exitCode = failures ? 1 : 0;
});
