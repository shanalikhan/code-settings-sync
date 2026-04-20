# Settings Sync by PrinceLundgren

> **Unofficial fork of [Settings Sync](https://github.com/shanalikhan/code-settings-sync) by [Shan Khan](https://github.com/shanalikhan), adjusted to work with [Kiro](https://kiro.dev) and includes bug fixes.**

Synchronize your settings, snippets, themes, file icons, launch configs, keybindings, workspaces, and extensions across multiple machines using GitHub Gist.

---

## Why this fork?

The original Settings Sync extension had issues that caused empty gist files and wasn't fully compatible with Kiro. This fork fixes:

- Empty gist uploads — files no longer silently get dropped during sync
- First-time upload flow — new gists are populated immediately without requiring a force-upload confirmation
- Missing `syncLocalSettings.json` no longer aborts the entire upload
- Webview compatibility with Kiro (modern `asWebviewUri` API)
- Updated Content Security Policy for Kiro's webview resource scheme

## Key Features

- Use your GitHub account token and Gist
- One-click upload and download
- Summary page showing what changed
- Auto download latest settings on startup
- Auto upload settings on file change
- Share your Gist with others so they can download your settings
- GitHub Enterprise support
- Sync Pragmas with `@sync` keywords: `host`, `os`, and `env`
- GUI for changing settings and logging in
- Sync any file across your machines

## What it syncs

- Settings (`settings.json`)
- Keybindings (`keybindings.json`)
- Launch configurations (`launch.json`)
- Snippets folder
- Extensions and their configurations
- Workspaces folder

## Shortcuts

| Action   | Windows/Linux       | macOS               |
|----------|---------------------|---------------------|
| Upload   | `Shift + Alt + U`   | `Shift + Option + U`|
| Download | `Shift + Alt + D`   | `Shift + Option + D`|

> Type `>Sync` in the Command Palette to see all commands.


## Setup

1. Open the Command Palette and type `Sync`
2. Click **Login with GitHub** on the welcome page
3. Authorize the app in your browser
4. Your first upload will create a new Gist automatically
5. Use the Gist ID on other machines to download your settings

## Settings

### Gist Settings (in `settings.json`)

```json
{
    "sync.gist": "",
    "sync.autoDownload": false,
    "sync.autoUpload": false,
    "sync.forceDownload": false,
    "sync.forceUpload": false,
    "sync.quietSync": false,
    "sync.removeExtensions": true,
    "sync.syncExtensions": true
}
```

### Local Settings (in `syncLocalSettings.json`)

Global settings stored in your User folder, shared across multiple Gist environments. Includes ignored files/folders, GitHub Enterprise URL, custom files, hostname, and more.

## Credits

This is a fork of [Code Settings Sync](https://github.com/shanalikhan/code-settings-sync) originally created by [Shan Khan](https://github.com/shanalikhan). All credit for the original extension goes to Shan and the [original contributors](https://github.com/shanalikhan/code-settings-sync/graphs/contributors).

## License

[MIT](LICENSE)
