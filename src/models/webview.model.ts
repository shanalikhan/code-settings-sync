import { WebviewPanel } from "vscode";

export interface IWebviewReplaceable {
  find: string;
  replace: any;
}

export interface IWebview {
  name: string;
  htmlPath: string;
  htmlContent?: string;
  webview?: WebviewPanel;
  replaceables: IWebviewReplaceable[];
}
