import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

/**
 * Service for handling disabled extensions in VSCode
 */
export class DisabledExtensionService {
  /**
   * Get the path to VSCode user settings.json file
   */
  private static getVSCodeConfigPath(): string {
    switch (process.platform) {
      case "win32":
        return path.join(
          os.homedir(),
          "AppData",
          "Roaming",
          "Code",
          "User",
          "settings.json"
        );
      case "darwin":
        return path.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Code",
          "User",
          "settings.json"
        );
      case "linux":
        return path.join(os.homedir(), ".config", "Code", "User", "settings.json");
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  /**
   * Get the path to workspace settings.json file
   */
  private static getWorkspaceConfigPath(): string | null {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return null;
    }
    
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    return path.join(workspaceRoot, ".vscode", "settings.json");
  }

  /**
   * Read VSCode settings from a JSON file
   */
  private static readSettings(configPath: string): any {
    try {
      if (!fs.existsSync(configPath)) {
        return {};
      }
      
      const configContent = fs.readFileSync(configPath, "utf8");
      return JSON.parse(configContent);
    } catch (error) {
      console.warn(`Could not read settings from ${configPath}:`, error);
      return {};
    }
  }

  /**
   * Write VSCode settings to a JSON file
   */
  private static writeSettings(configPath: string, settings: any): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const configContent = JSON.stringify(settings, null, 2);
      fs.writeFileSync(configPath, configContent, "utf8");
    } catch (error) {
      console.error(`Could not write settings to ${configPath}:`, error);
      throw error;
    }
  }

  /**
   * Get list of globally disabled extensions
   */
  public static getGloballyDisabledExtensions(): string[] {
    try {
      const configPath = this.getVSCodeConfigPath();
      const settings = this.readSettings(configPath);
      return settings["extensions.disabled"] || [];
    } catch (error) {
      console.warn("Could not read globally disabled extensions:", error);
      return [];
    }
  }

  /**
   * Get list of workspace disabled extensions
   */
  public static getWorkspaceDisabledExtensions(): string[] {
    try {
      const configPath = this.getWorkspaceConfigPath();
      if (!configPath) {
        return [];
      }
      
      const settings = this.readSettings(configPath);
      return settings["extensions.disabled"] || [];
    } catch (error) {
      console.warn("Could not read workspace disabled extensions:", error);
      return [];
    }
  }

  /**
   * Get all disabled extensions (global + workspace)
   */
  public static getAllDisabledExtensions(): { global: string[]; workspace: string[] } {
    return {
      global: this.getGloballyDisabledExtensions(),
      workspace: this.getWorkspaceDisabledExtensions()
    };
  }

  /**
   * Set extension disabled state globally
   */
  public static async setGlobalExtensionDisabled(
    extensionId: string,
    disabled: boolean
  ): Promise<void> {
    try {
      const configPath = this.getVSCodeConfigPath();
      const settings = this.readSettings(configPath);
      
      let disabledExtensions: string[] = settings["extensions.disabled"] || [];
      
      if (disabled) {
        // Add to disabled list if not already present
        if (!disabledExtensions.includes(extensionId)) {
          disabledExtensions.push(extensionId);
        }
        
        // Use VSCode command to disable the extension
        await vscode.commands.executeCommand(
          "workbench.extensions.disableExtension",
          extensionId
        );
      } else {
        // Remove from disabled list
        disabledExtensions = disabledExtensions.filter(id => id !== extensionId);
        
        // Use VSCode command to enable the extension
        await vscode.commands.executeCommand(
          "workbench.extensions.enableExtension",
          extensionId
        );
      }
      
      // Update settings
      settings["extensions.disabled"] = disabledExtensions;
      this.writeSettings(configPath, settings);
      
    } catch (error) {
      console.error(`Failed to set extension ${extensionId} disabled state:`, error);
      throw error;
    }
  }

  /**
   * Set extension disabled state in workspace
   */
  public static async setWorkspaceExtensionDisabled(
    extensionId: string,
    disabled: boolean
  ): Promise<void> {
    try {
      const configPath = this.getWorkspaceConfigPath();
      if (!configPath) {
        throw new Error("No workspace found");
      }
      
      const settings = this.readSettings(configPath);
      let disabledExtensions: string[] = settings["extensions.disabled"] || [];
      
      if (disabled) {
        // Add to disabled list if not already present
        if (!disabledExtensions.includes(extensionId)) {
          disabledExtensions.push(extensionId);
        }
        
        // Use VSCode command to disable the extension in workspace
        await vscode.commands.executeCommand(
          "workbench.extensions.disableExtensionInWorkspace",
          extensionId
        );
      } else {
        // Remove from disabled list
        disabledExtensions = disabledExtensions.filter(id => id !== extensionId);
        
        // Use VSCode command to enable the extension in workspace
        await vscode.commands.executeCommand(
          "workbench.extensions.enableExtensionInWorkspace",
          extensionId
        );
      }
      
      // Update settings
      settings["extensions.disabled"] = disabledExtensions;
      this.writeSettings(configPath, settings);
      
    } catch (error) {
      console.error(`Failed to set workspace extension ${extensionId} disabled state:`, error);
      throw error;
    }
  }

  /**
   * Restore disabled extensions from sync data
   */
  public static async restoreDisabledExtensions(
    globalDisabled: string[],
    workspaceDisabled: string[]
  ): Promise<void> {
    try {
      // Restore globally disabled extensions
      for (const extensionId of globalDisabled) {
        await this.setGlobalExtensionDisabled(extensionId, true);
      }
      
      // Restore workspace disabled extensions
      for (const extensionId of workspaceDisabled) {
        await this.setWorkspaceExtensionDisabled(extensionId, true);
      }
      
      console.log(`Restored ${globalDisabled.length} globally disabled and ${workspaceDisabled.length} workspace disabled extensions`);
    } catch (error) {
      console.error("Failed to restore disabled extensions:", error);
      throw error;
    }
  }

  /**
   * Check if an extension is disabled
   */
  public static isExtensionDisabled(extensionId: string): {
    globallyDisabled: boolean;
    workspaceDisabled: boolean;
  } {
    const globalDisabled = this.getGloballyDisabledExtensions();
    const workspaceDisabled = this.getWorkspaceDisabledExtensions();
    
    return {
      globallyDisabled: globalDisabled.includes(extensionId),
      workspaceDisabled: workspaceDisabled.includes(extensionId)
    };
  }
}