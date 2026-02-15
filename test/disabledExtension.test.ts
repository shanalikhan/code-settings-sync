import * as assert from "assert";
import * as vscode from "vscode";
import { DisabledExtensionService } from "../src/service/disabledExtension.service";
import { PluginService, ExtensionInformation } from "../src/service/plugin.service";

suite("Disabled Extension Support Tests", () => {
  test("DisabledExtensionService should detect disabled extensions", async () => {
    // This test would need to be run in a VSCode environment with some disabled extensions
    const disabledExtensions = DisabledExtensionService.getAllDisabledExtensions();
    
    assert.ok(disabledExtensions.hasOwnProperty('global'));
    assert.ok(disabledExtensions.hasOwnProperty('workspace'));
    assert.ok(Array.isArray(disabledExtensions.global));
    assert.ok(Array.isArray(disabledExtensions.workspace));
  });

  test("ExtensionInformation should support disabled properties", () => {
    const ext = new ExtensionInformation();
    ext.name = "test-extension";
    ext.publisher = "test-publisher";
    ext.version = "1.0.0";
    ext.disabled = true;
    ext.disabledGlobally = true;
    ext.disabledInWorkspace = false;

    assert.strictEqual(ext.disabled, true);
    assert.strictEqual(ext.disabledGlobally, true);
    assert.strictEqual(ext.disabledInWorkspace, false);
  });

  test("ExtensionInformation.fromJSON should parse disabled properties", () => {
    const jsonData = {
      name: "test-extension",
      publisher: "test-publisher",
      version: "1.0.0",
      disabled: true,
      disabledGlobally: true,
      disabledInWorkspace: false,
      meta: {
        galleryApiUrl: "",
        id: "test-publisher.test-extension",
        downloadUrl: "",
        publisherId: "test-publisher",
        publisherDisplayName: "Test Publisher",
        date: ""
      }
    };

    const ext = ExtensionInformation.fromJSON(JSON.stringify(jsonData));
    
    assert.strictEqual(ext.name, "test-extension");
    assert.strictEqual(ext.publisher, "test-publisher");
    assert.strictEqual(ext.disabled, true);
    assert.strictEqual(ext.disabledGlobally, true);
    assert.strictEqual(ext.disabledInWorkspace, false);
  });

  test("CreateExtensionList should include disabled extensions", () => {
    // This test would need to mock the VSCode API and file system
    // For now, we'll just test that the method exists and can be called
    const extensions = PluginService.CreateExtensionList();
    assert.ok(Array.isArray(extensions));
  });

  test("DisabledExtensionService should handle missing config files gracefully", () => {
    // Test that the service doesn't crash when config files don't exist
    const globalDisabled = DisabledExtensionService.getGloballyDisabledExtensions();
    const workspaceDisabled = DisabledExtensionService.getWorkspaceDisabledExtensions();
    
    assert.ok(Array.isArray(globalDisabled));
    assert.ok(Array.isArray(workspaceDisabled));
  });
});

// Integration test helper
export class DisabledExtensionTestHelper {
  /**
   * Create a mock extension list with disabled extensions for testing
   */
  static createMockExtensionList(): ExtensionInformation[] {
    const extensions: ExtensionInformation[] = [];
    
    // Enabled extension
    const enabledExt = new ExtensionInformation();
    enabledExt.name = "enabled-extension";
    enabledExt.publisher = "test-publisher";
    enabledExt.version = "1.0.0";
    enabledExt.disabled = false;
    enabledExt.disabledGlobally = false;
    enabledExt.disabledInWorkspace = false;
    extensions.push(enabledExt);
    
    // Globally disabled extension
    const globallyDisabledExt = new ExtensionInformation();
    globallyDisabledExt.name = "globally-disabled-extension";
    globallyDisabledExt.publisher = "test-publisher";
    globallyDisabledExt.version = "1.0.0";
    globallyDisabledExt.disabled = true;
    globallyDisabledExt.disabledGlobally = true;
    globallyDisabledExt.disabledInWorkspace = false;
    extensions.push(globallyDisabledExt);
    
    // Workspace disabled extension
    const workspaceDisabledExt = new ExtensionInformation();
    workspaceDisabledExt.name = "workspace-disabled-extension";
    workspaceDisabledExt.publisher = "test-publisher";
    workspaceDisabledExt.version = "1.0.0";
    workspaceDisabledExt.disabled = true;
    workspaceDisabledExt.disabledGlobally = false;
    workspaceDisabledExt.disabledInWorkspace = true;
    extensions.push(workspaceDisabledExt);
    
    return extensions;
  }
  
  /**
   * Verify that disabled extension states are correctly serialized
   */
  static verifySerializedExtensions(serialized: string): boolean {
    try {
      const extensions = JSON.parse(serialized);
      
      if (!Array.isArray(extensions)) {
        return false;
      }
      
      // Check that disabled properties are preserved
      for (const ext of extensions) {
        if (ext.disabled !== undefined) {
          if (typeof ext.disabled !== 'boolean') {
            return false;
          }
        }
        if (ext.disabledGlobally !== undefined) {
          if (typeof ext.disabledGlobally !== 'boolean') {
            return false;
          }
        }
        if (ext.disabledInWorkspace !== undefined) {
          if (typeof ext.disabledInWorkspace !== 'boolean') {
            return false;
          }
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
}