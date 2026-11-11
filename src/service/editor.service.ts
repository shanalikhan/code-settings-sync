import * as vscode from "vscode";

import { HasDirtyDocument, normalizeFilePath } from "./editorMatch";
import { FileService } from "./file.service";

export class EditorService {
  /**
   * Overwrites filePath during a download. Clean editors showing the file are
   * closed first. If any editor (visible or hidden) has unsaved changes for the
   * file, the write is skipped and the user is told why.
   */
  public static async WriteFile(
    filePath: string,
    content: string
  ): Promise<boolean> {
    if (HasDirtyDocument(vscode.workspace.textDocuments, filePath)) {
      vscode.window.showWarningMessage(
        `Sync : ${filePath} has unsaved changes in an editor and was not overwritten. Save or revert it, then download again.`
      );
      return false;
    }
    if (!(await EditorService.CloseCleanEditors(filePath))) {
      return false;
    }
    // A hidden editor may have become dirty while closing clean target tabs.
    if (HasDirtyDocument(vscode.workspace.textDocuments, filePath)) {
      vscode.window.showWarningMessage(
        `Sync : ${filePath} has unsaved changes in an editor and was not overwritten. Save or revert it, then download again.`
      );
      return false;
    }
    return FileService.WriteFile(filePath, content);
  }

  private static async CloseCleanEditors(filePath: string): Promise<boolean> {
    const target = normalizeFilePath(filePath);
    const editors = vscode.window.visibleTextEditors.filter(
      editor => normalizeFilePath(editor.document.fileName) === target
    );
    for (const editor of editors) {
      const shown = await vscode.window.showTextDocument(editor.document, {
        viewColumn: editor.viewColumn,
        preserveFocus: false,
        preview: false
      });
      // closeActiveEditor targets the focused tab, not the document passed to
      // showTextDocument. Refuse to close anything other than this sync target.
      const active = vscode.window.activeTextEditor;
      if (
        !active ||
        active.document !== shown.document ||
        normalizeFilePath(active.document.fileName) !== target
      ) {
        throw new Error("Could not safely focus the file being downloaded.");
      }
      // Editing may resume while showTextDocument awaits the editor reveal.
      if (active.document.isDirty) {
        vscode.window.showWarningMessage(
          `Sync : ${filePath} has unsaved changes in an editor and was not overwritten. Save or revert it, then download again.`
        );
        return false;
      }
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
    }
    return true;
  }
}
