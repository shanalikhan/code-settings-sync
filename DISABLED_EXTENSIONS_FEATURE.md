# Disabled Extensions Sync Feature

This implementation adds support for synchronizing disabled extensions in VSCode Settings Sync.

## Problem Solved

Previously, VSCode Settings Sync could not synchronize the disabled state of extensions. When users disabled extensions on one machine, those extensions would remain enabled when synced to another machine.

## Solution Overview

The solution works by:

1. **Detection**: Reading VSCode's internal settings to detect disabled extensions
2. **Storage**: Including disabled extension information in the sync data
3. **Restoration**: Restoring disabled states when downloading settings

## New Files Added

### `src/service/disabledExtension.service.ts`
Core service for handling disabled extensions:
- Reads VSCode user and workspace settings
- Detects globally and workspace-disabled extensions
- Provides methods to enable/disable extensions programmatically
- Handles cross-platform configuration file paths

### `test/disabledExtension.test.ts`
Comprehensive test suite for the new functionality:
- Unit tests for disabled extension detection
- Integration tests for sync workflow
- Mock data helpers for testing

## Modified Files

### `src/service/plugin.service.ts`
Enhanced the `ExtensionInformation` class and `PluginService`:
- Added `disabled`, `disabledGlobally`, and `disabledInWorkspace` properties
- Updated `CreateExtensionList()` to include disabled extensions
- Added `RestoreDisabledExtensions()` method for sync restoration
- Enhanced JSON serialization/deserialization

### `src/sync.ts`
Integrated disabled extension restoration into the download workflow:
- Added call to `RestoreDisabledExtensions()` after extension installation
- Proper error handling and user feedback

## How It Works

### During Upload (Sync to Cloud)
1. `CreateExtensionList()` now includes both enabled and disabled extensions
2. Each extension has flags indicating its disabled state:
   - `disabled`: true if disabled in any way
   - `disabledGlobally`: true if disabled globally
   - `disabledInWorkspace`: true if disabled in current workspace
3. This information is serialized and uploaded to the Gist

### During Download (Sync from Cloud)
1. Extensions are installed as before
2. After installation, `RestoreDisabledExtensions()` is called
3. The service reads the disabled state flags from sync data
4. Uses VSCode commands to disable extensions as needed:
   - `workbench.extensions.disableExtension` for global disable
   - `workbench.extensions.disableExtensionInWorkspace` for workspace disable

## Configuration File Locations

The service reads disabled extension information from:

**Windows:**
- `%APPDATA%\Code\User\settings.json`
- `<workspace>\.vscode\settings.json`

**macOS:**
- `~/Library/Application Support/Code/User/settings.json`
- `<workspace>/.vscode/settings.json`

**Linux:**
- `~/.config/Code/User/settings.json`
- `<workspace>/.vscode/settings.json`

## VSCode Settings Format

Disabled extensions are stored in the `extensions.disabled` array:

```json
{
  "extensions.disabled": [
    "publisher.extension-name",
    "another-publisher.another-extension"
  ]
}
```

## Error Handling

The implementation includes robust error handling:
- Gracefully handles missing configuration files
- Continues sync process even if disabled extension restoration fails
- Provides user feedback through output channel and status bar
- Logs errors for debugging

## Backward Compatibility

The implementation is fully backward compatible:
- Existing sync data without disabled extension info works normally
- New properties are optional and default to `false`
- No breaking changes to existing APIs

## Testing

Run the test suite:
```bash
npm test
```

The tests cover:
- Disabled extension detection
- JSON serialization/deserialization
- Error handling for missing files
- Mock data generation for integration testing

## Usage

Once implemented, the feature works automatically:

1. **Setup**: No additional configuration needed
2. **Upload**: Disabled extensions are automatically included in sync
3. **Download**: Disabled states are automatically restored
4. **Feedback**: Progress shown in output channel and status bar

## Future Enhancements

Potential improvements for future versions:
- Configuration option to enable/disable this feature
- Support for extension-specific workspace settings
- Bulk enable/disable operations
- UI indicators for disabled extension sync status

## Issue Resolution

This implementation fully resolves [Issue #143](https://github.com/shanalikhan/code-settings-sync/issues/143) by providing complete support for disabled extension synchronization across all platforms and workspace configurations.