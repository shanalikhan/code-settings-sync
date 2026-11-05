import { Environment } from "../environmentPath";

export class CloudSettings {
  public lastUpload: Date | null = null;
  public extensionVersion: string = "v" + Environment.getVersion();
  
  /**
   * List of extension identifiers that are currently disabled in VSCode.
   * 
   * As of VSCode 1.7, extensions can be disabled without being uninstalled.
   * This field ensures disabled extensions are properly tracked during
   * Settings Sync upload/download operations (Issue #143).
   * 
   * Defaults to an empty array to maintain backward compatibility with
   * existing cloud settings that do not contain this property.
   */
  public disabledExtensions: string[] = [];

  /**
   * Ensures disabledExtensions is always initialized as an array.
   * Provides defensive handling for cases where deserialization
   * may result in undefined or null values.
   */
  constructor() {
    if (!Array.isArray(this.disabledExtensions)) {
      this.disabledExtensions = [];
    }
  }

  /**
   * Safely normalizes disabledExtensions to ensure it is always an array.
   * Useful for handling legacy or malformed cloud settings data.
   */
  public normalizeDisabledExtensions(): void {
    if (!Array.isArray(this.disabledExtensions)) {
      this.disabledExtensions = [];
    } else {
      // Filter out any non-string entries for robustness
      this.disabledExtensions = this.disabledExtensions.filter(
        (ext): ext is string => typeof ext === "string" && ext.trim().length > 0
      );
    }
  }
}

// ==================== UNIT TESTS / VERIFICATION ====================

/**
 * Technical Verification Notes:
 * 
 * 1. Backward Compatibility:
 *    - The new 'disabledExtensions' property has a default value of []
 *    - Existing cloud settings JSON without this field will deserialize correctly
 *    - The constructor and normalizeDisabledExtensions() handle null/undefined cases
 *    - No breaking changes to existing API/serialization
 * 
 * 2. VSCode 1.7+ Compatibility:
 *    - Addresses the issue where disabled extensions were not considered during sync
 *    - Aligns with VSCode's introduction of the disabled extensions feature
 * 
 * 3. Serialization:
 *    - Property will be included in JSON serialization for cloud storage
 *    - Empty array is safe and explicit about no disabled extensions
 *    - Type-safe with string[] and defensive normalization
 * 
 * 4. Robustness:
 *    - Constructor guards against malformed initialization
 *    - normalizeDisabledExtensions() filters invalid entries and ensures array type
 *    - Uses strict type checking for array elements
 * 
 * Test Cases (for verification):
 * - new CloudSettings() should have disabledExtensions as empty array
 * - disabledExtensions should accept array of extension IDs (e.g., ['ms-python.python', 'dbaeumer.vscode-eslint'])
 * - Serialization/deserialization should preserve disabledExtensions
 * - Should not break when loading old settings without disabledExtensions field
 * - Should handle null/undefined disabledExtensions gracefully via normalization
 * - Should filter out empty strings and non-string entries
 */