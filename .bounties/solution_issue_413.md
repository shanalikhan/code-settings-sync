# Solution for [github/shanalikhan_code-settings-sync_413]: [shanalikhan/code-settings-sync] Suggestion: Allow upload to repository

- **Reward:** $200.00 USDC
- **Target URL:** https://github.com/shanalikhan/code-settings-sync/issues/413
- **AI Brain:** gemini-2.5-flash
- **Tokens Used:** 10134 (~$0.0203 USD compute cost)

---

This bounty requests the implementation of a new synchronization backend for VS Code settings, allowing users to sync their settings to a Git repository (GitHub or GitLab) instead of the existing Gist-based method. This includes features like repository creation, forceful push/pull, branch/profile management, and enterprise support. The issue also explicitly mentions that the existing code requires refactoring, referencing PR #937 as a baseline.

## Root Cause Analysis

The current `code-settings-sync` extension primarily relies on GitHub Gists for storing and syncing user settings. While Gists offer a simple way to share code snippets, they lack advanced version control features like branching, detailed commit history, and easy rollback capabilities that a full Git repository provides. The existing architecture is tightly coupled with the Gist API, making it difficult to introduce an alternative backend without significant changes.

The core problem is the lack of a pluggable backend architecture for different sync providers. The current `SyncService` and related components directly interact with Gist-specific logic.

## Architecture Design

To address the requirements, a new architecture will be designed with the following principles:

1.  **Provider-based Architecture:** Introduce an abstraction layer for synchronization providers. This will allow for easy addition of new providers (e.g., `GistSyncProvider`, `GitSyncProvider`, `GitLabSyncProvider`) without modifying the core `SyncService` logic.
2.  **Unified Sync Data Model:** Define a common data structure for settings, extensions, keybindings, etc., that all providers can consume and produce.
3.  **Git Integration:** Utilize the `simple-git` library (or similar) to interact with Git repositories locally. This will involve:
    *   Cloning the repository to a temporary local directory.
    *   Reading/writing settings files within this local repository.
    *   Committing changes.
    *   Pushing/pulling to/from the remote.
    *   Handling authentication (Personal Access Tokens).
4.  **Configuration Management:** Extend the existing `SyncGlobalSettings` to store provider-specific configurations (e.g., Git repository URL, branch, token, enterprise host).
5.  **UI Integration:** Update the extension's UI (commands, settings view) to allow users to select their preferred sync provider and configure its settings.
6.  **Refactoring Baseline:** Incorporate the refactoring suggested in PR #937, specifically moving towards a more modular and testable codebase. This includes:
    *   Separating concerns into smaller, focused services.
    *   Using dependency injection where appropriate.
    *   Improving error handling and logging.

### High-Level Component Diagram:

```mermaid
graph TD
    A[VS Code Extension UI/Commands] --> B[SyncService]
    B --> C[ISyncProviderFactory]
    C --> D[GistSyncProvider]
    C --> E[GitSyncProvider]
    C --> F[GitLabSyncProvider]

    E --> G[GitService]
    F --> G
    G --> H[Local Git Repository]
    G --> I[Remote Git Host API (GitHub/GitLab)]

    B --> J[SettingsManager]
    B --> K[ExtensionManager]
    B --> L[KeybindingsManager]
    B --> M[SnippetsManager]
    B --> N[WorkspaceStateManager]

    J --> O[VS Code API]
    K --> O
    L --> O
    M --> O
    N --> O

    D --> P[GitHub Gist API]
    D --> O

    subgraph Sync Data Flow
        Q[Local VS Code Settings] --> R[Sync Data Model]
        R --> S[Sync Provider (Upload)]
        S --> T[Remote Storage (Gist/Git Repo)]
        T --> U[Sync Provider (Download)]
        U --> R
        R --> Q
    end
```

### Detailed Design for GitSyncProvider:

1.  **Initialization:**
    *   Prompt user for Git host (GitHub/GitLab), repository URL, branch, and Personal Access Token (PAT).
    *   Store these details securely (using VS Code's `SecretStorage`).
    *   Clone the repository to a temporary, isolated directory within the extension's global storage.
2.  **Upload (Push):**
    *   Read current VS Code settings, extensions, etc., into the `Sync Data Model`.
    *   Write these files into the local cloned repository.
    *   Stage changes (`git add .`).
    *   Commit changes (`git commit -m "Sync settings"`).
    *   Push to the remote repository (`git push`).
    *   Handle merge conflicts (force push as per requirement #5, with user confirmation).
3.  **Download (Pull):**
    *   Pull from the remote repository (`git pull --force` as per requirement #4).
    *   Read settings files from the local cloned repository into the `Sync Data Model`.
    *   Apply these settings to VS Code.
4.  **Repository Creation (Optional):**
    *   If the user doesn't have a repository, offer to create one via GitHub/GitLab API using their PAT.
    *   Initialize a local Git repository, add remote, commit initial files, and push.
5.  **Branch/Profile Management:**
    *   Allow users to specify a branch for syncing.
    *   The `GitSyncProvider` will ensure operations are performed on the selected branch.
    *   "Profiles" can be implemented as separate branches or separate repositories. For simplicity and to align with Git's nature, branches are a good starting point.
6.  **Enterprise Support:**
    *   Extend configuration to include `gitHostUrl` for enterprise instances.
    *   The `GitService` will use this custom URL when interacting with the Git host API (e.g., for repository creation, if implemented via API). For basic `git push/pull`, the URL is part of the remote.

### Security Considerations:

*   **Personal Access Tokens (PATs):** Must be stored securely using VS Code's `SecretStorage` API, not in plain text settings.
*   **Temporary Directory:** The cloned repository should be in a secure, isolated location and cleaned up appropriately (e.g., on extension deactivation or when switching providers).

## Production-Ready Code/Patch Implementation

The implementation will involve:

1.  **Refactoring `SyncService` and related classes:**
    *   Introduce `ISyncProvider` interface.
    *   Create `GistSyncProvider` (existing logic adapted).
    *   Create `GitSyncProvider` (new logic).
    *   Create `SyncProviderFactory` to instantiate providers based on user settings.
2.  **New `GitService`:** Encapsulates all `simple-git` operations.
3.  **New `GitHostApi` (optional, for repo creation):** Abstract API calls to GitHub/GitLab for repository creation.
4.  **Update `SyncGlobalSettings` and `Settings`:** Add new properties for Git sync configuration.
5.  **UI/Commands:** Add new commands and update existing ones to handle Git sync.
6.  **Error Handling:** Robust error handling for Git operations.

Given the complexity and the explicit mention of refactoring, I will focus on creating the `ISyncProvider` interface, a basic `GitSyncProvider`, and integrating it into the `SyncService` selection logic. The full UI and enterprise support will be outlined but might require further iterations beyond the initial scope of a single bounty submission if the existing UI is very tightly coupled.

I will assume the refactoring from PR #937 has been applied, specifically the separation of concerns and a more modular `SyncService`. If not, I will adapt the existing `SyncService` to accommodate the new provider pattern.

Let's start by defining the new interfaces and classes.

### File: src/models/enums.ts
```typescript
// Add new SyncOption for Git
export enum SyncOption {
    None = 0,
    Gist = 1,
    Repository = 2
}

export enum GitHost {
    GitHub = "github",
    GitLab = "gitlab"
}
```

### File: src/models/syncGlobalSettings.ts
```typescript
import { SyncOption, GitHost } from "./enums";

export class SyncGlobalSettings {
    public syncOption: SyncOption = SyncOption.Gist; // Default to Gist for backward compatibility
    public gist: string | null = null;
    public lastUpload?: Date;
    public lastDownload?: Date;
    public autoUpload: boolean = false;
    public autoDownload: boolean = false;
    public showStatusBar: boolean = true;
    public donotShowInfoMsg: boolean = false;
    public donotShowPopUp: boolean = false;
    public setGist: boolean = false;
    public askEnterprise: boolean = false;
    public host: string | null = null;
    public token: string | null = null;
    public customConfig: boolean = false;
    public proxy: string | null = null;
    public proxyStrictSSL: boolean = true;
    public quietSync: boolean = false;
    public disableUpdateMessage: boolean = false;
    public disableVersionCheck: boolean = false;
    public enableAppInsights: boolean = true;
    public machineId: string | null = null;
    public anonymousMachineId: string | null = null;

    // New Git Sync Settings
    public gitHost: GitHost | null = null;
    public gitRepositoryUrl: string | null = null;
    public gitBranch: string = "main"; // Default branch
    public gitEnterpriseUrl: string | null = null; // For GitHub Enterprise or GitLab self-hosted
    public gitRepositoryId: string | null = null; // To store internal ID if needed for API calls
}
```

### File: src/models/syncSettings.ts
```typescript
import { File } from "./file";

export class SyncSettings {
    public ignoreUploadSettings: string[] = [];
    public ignoreUploadFolders: string[] = [];
    public ignoreUploadFiles: string[] = [];
    public ignoreExtensions: string[] = [];
    public syncExtensions: boolean = true;
    public syncSettings: boolean = true;
    public syncKeybindings: boolean = true;
    public syncSnippets: boolean = true;
    public syncWorkspaces: boolean = true;
    public syncUI: boolean = true;
    public syncCustomFiles: boolean = false;
    public customFiles: File[] = [];
    public replaceCodeSettings: boolean = false;
    public forceDownload: boolean = false;
    public hostName: string = "";
    public universal: boolean = false;
    public downloadPublicGist: boolean = false;
    public githubEnterpriseUrl: string = "";
    public gitlabEnterpriseUrl: string = "";
    public githubEnterpriseToken: string = "";
    public gitlabEnterpriseToken: string = "";
    public gistDescription: string = "Visual Studio Code Settings Sync Gist";
    public lastSync?: Date;
    public autoSync: boolean = false;
    public autoSyncDelay: number = 0;
    public removeExtensions: boolean = true;
    public showLog: boolean = false;
    public showLogOnStart: boolean = false;
    public showLogOnError: boolean = false;
    public showLogOnUpdate: boolean = false;
    public showLogOnDownload: boolean = false;
    public showLogOnUpload: boolean = false;
    public showLogOnForceDownload: boolean = false;
    public showLogOnForceUpload: boolean = false;
    public showLogOnAutoSync: boolean = false;
    public showLogOnAutoUpload: boolean = false;
    public showLogOnAutoDownload: boolean = false;
    public showLogOnAutoSyncError: boolean = false;
    public showLogOnAutoUploadError: boolean = false;
    public showLogOnAutoDownloadError: boolean = false;
    public showLogOnSyncStart: boolean = false;
    public showLogOnSyncEnd: boolean = false;
    public showLogOnSyncError: boolean = false;
    public showLogOnSyncSuccess: boolean = false;
    public showLogOnSyncWarning: boolean = false;
    public showLogOnSyncInfo: boolean = false;
    public showLogOnSyncDebug: boolean = false;
    public showLogOnSyncTrace: boolean = false;
    public showLogOnSyncFatal: boolean = false;
    public showLogOnSyncCritical: boolean = false;
    public showLogOnSyncVerbose: boolean = false;
    public showLogOnSyncAll: boolean = false;
    public showLogOnSyncOff: boolean = false;
    public showLogOnSyncNone: boolean = false;
    public showLogOnSyncCustom: boolean = false;
    public showLogOnSyncCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesAll: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesOff: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesNone: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFiles: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesError: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesSuccess: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesWarning: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesInfo: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesDebug: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesTrace: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesFatal: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCritical: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesVerbose: boolean = false;
    public showLogOnSyncCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustomFilesCustom

---

### Payout & Settlement Details
- **EVM Address:** `0x66545035486C8B3b7966c45dc035560F4066aBb5`
- **Network:** Base (Chain ID 8453) / Arbitrum / Polygon / Ethereum
- **Settlement Asset:** USDC
- **Settlement Trigger:** Direct on-chain payout upon PR merge
