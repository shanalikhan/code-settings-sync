import { OutputChannel, window } from "vscode";
import localize from "../localize";

export class LoggerService {
  public static outputChannel: OutputChannel;
  public static LogException(
    error: any,
    message: string,
    showMessageBox: boolean
  ): void {
    if (error) {
      console.error(error);
      if (error.status === 500) {
        message = localize("common.error.connection");
        showMessageBox = false;
      } else if (error.status === 401) {
        showMessageBox = true;
        message = localize("common.error.invalidToken");
      } else if (error.status === 4) {
        message = localize("common.error.canNotSave");
      } else if (error.message) {
        try {
          message = JSON.parse(error.message).message;
          if (message.toLowerCase() === "not found") {
            showMessageBox = true;
            message = localize("common.error.invalidGistId");
          }
        } catch (error) {
          //  message = error.message;
        }
      }
    }

    if (showMessageBox === true) {
      window.showErrorMessage(message);
      window.setStatusBarMessage("").dispose();
    } else {
      window.setStatusBarMessage(message, 5000);
    }
  }
}
