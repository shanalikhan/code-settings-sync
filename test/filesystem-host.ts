// Only the VS Code host boundary is substituted. Files, sync services, pragmas,
// extension serialization, and command routing run their production code.
import * as path from "path";
const Module = require("module");
const load = Module._load;
export const host = {
  answer: undefined as string | undefined,
  prompts: [] as string[],
  commands: [] as unknown[][],
  errors: [] as string[],
  extensions: [] as any[],
  messageHandler: undefined as ((message: any) => void) | undefined
};
process.env.VSCODE_NLS_CONFIG = JSON.stringify({ locale: "en" });
const vscode = {
  Uri: {
    file: (value: string) => ({ with: () => ({ toString: () => value }) })
  },
  ViewColumn: { One: 1 },
  extensions: {
    get all() {
      return host.extensions;
    },
    getExtension: () => ({ extensionPath: path.resolve(__dirname, "../..") }),
    onDidChange: () => ({ dispose() {} })
  },
  window: {
    createWebviewPanel: () => ({
      webview: {
        html: "",
        onDidReceiveMessage: (callback: (message: any) => void) => {
          host.messageHandler = callback;
        }
      },
      onDidDispose: () => undefined,
      reveal: () => undefined
    }),
    state: { focused: true },
    setStatusBarMessage: () => ({ dispose() {} }),
    showWarningMessage: async (message: string) => {
      host.prompts.push(message);
      return host.answer;
    },
    showInformationMessage: async () => undefined,
    showErrorMessage: async (message: string) => {
      host.errors.push(message);
    }
  },
  commands: {
    executeCommand: async (...args: unknown[]) => {
      host.commands.push(args);
    }
  },
  workspace: { getConfiguration: () => ({ get: () => undefined }) }
};
Module._load = function(request: string, parent: unknown, main: boolean) {
  return request === "vscode" ? vscode : load.call(this, request, parent, main);
};
