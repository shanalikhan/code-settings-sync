import * as path from "path";

/**
 * Minimal stand-in for the "vscode" module so FileSystemService can be tested
 * with plain mocha. It is only installed when the real API is unavailable;
 * inside the VS Code test host the real module is used and these tests skip.
 */
export const recorded = {
  errors: new Array<string>(),
  warnings: new Array<string>(),
  info: new Array<string>(),
  commands: new Array<unknown[]>()
};

export const answers = {
  /** Answers returned by showInformationMessage, in order. */
  info: new Array<string>(),
  /** Folder returned by showOpenDialog; undefined means the dialog was cancelled. */
  openDialog: undefined as string
};

export function ResetStub(): void {
  recorded.errors.length = 0;
  recorded.warnings.length = 0;
  vscodeStub.workspace.textDocuments.length = 0;
  vscodeStub.window.visibleTextEditors.length = 0;
  recorded.info.length = 0;
  recorded.commands.length = 0;
  answers.info.length = 0;
  answers.openDialog = undefined;
}

// out/test/service/filesystem -> repository root (holds package.nls.json)
const extensionPath = path.resolve(__dirname, "../../../..");

const disposable = { dispose: () => undefined };
const outputChannel = {
  append: () => undefined,
  appendLine: () => undefined,
  clear: () => undefined,
  show: () => undefined
};

const vscodeStub = {
  workspace: {
    textDocuments: new Array<{ fileName: string; isDirty: boolean }>()
  },
  commands: {
    executeCommand: async (...args: unknown[]) => {
      recorded.commands.push(args);
      return undefined;
    }
  },
  extensions: {
    all: new Array<unknown>(),
    getExtension: () => ({ extensionPath }),
    onDidChange: () => disposable
  },
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      with: () => ({ toString: () => `vscode-resource:${fsPath}` })
    }),
    parse: (value: string) => ({ fsPath: value })
  },
  window: {
    visibleTextEditors: new Array<unknown>(),
    createOutputChannel: () => outputChannel,
    setStatusBarMessage: () => disposable,
    showWarningMessage: async (message: string) => {
      recorded.warnings.push(message);
      return undefined;
    },
    showErrorMessage: async (message: string) => {
      recorded.errors.push(message);
      return undefined;
    },
    showInformationMessage: async (message: string) => {
      recorded.info.push(message);
      return answers.info.shift();
    },
    showOpenDialog: async () =>
      answers.openDialog === undefined
        ? undefined
        : [{ fsPath: answers.openDialog }],
    state: { focused: true }
  }
};

function HasRealVscode(): boolean {
  try {
    require("vscode");
    return true;
  } catch (err) {
    return false;
  }
}

export const usingStub = !HasRealVscode();

if (usingStub) {
  process.env.VSCODE_NLS_CONFIG =
    process.env.VSCODE_NLS_CONFIG || JSON.stringify({ locale: "en" });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Module = require("module");
  const load = Module._load;
  Module._load = function(request: string, ...rest: unknown[]) {
    if (request === "vscode") {
      return vscodeStub;
    }
    return load.call(this, request, ...rest);
  };
}
