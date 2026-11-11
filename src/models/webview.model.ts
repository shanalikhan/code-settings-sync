import { WebviewPanel } from "vscode";

export interface IWebviewReplaceable {
  find: string;
  replace: any;
  /** URI-encode the JSON so paths with backslashes or quotes survive inside the page script. */
  encode?: boolean;
}

export interface IWebview {
  name: string;
  htmlPath: string;
  htmlContent?: string;
  webview?: WebviewPanel;
  replaceables: IWebviewReplaceable[];
}
