import { Environment } from "../environmentPath";

/**
 * CloudSettings model extended to support Git repository upload/sync.
 *
 * Holds persisted sync metadata plus repository configuration used by
 * upload-to-repository flows. Secret material (tokens) must never be written
 * to backups or logs; use secure storage in the service layer.
 *
 * Feature: Allow upload to repository (Issue #413)
 * Refactoring baseline: PR #937
 */
export class CloudSettings {
  /** Existing fields */
  public lastUpload: Date | string | null = null;
  public extensionVersion: string = "v" + Environment.getVersion();

  /** Repository upload fields */
  public repositoryUrl?: string;
  public repositoryOwner?: string;
  public repositoryName?: string;
  public branch: string = "main";
  public useAuthentication: boolean = false;
  /** Sensitive: excluded from toJSON()/toBackupObject()/sanitizeForLog(). */
  public token?: string;
  public autoBackupBeforeUpload: boolean = true;
  public lastRepositorySync?: Date | string | null;

  private static readonly DEFAULT_BRANCH = "main";
  private static readonly MAX_URL_LENGTH = 2048;
  private static readonly MAX_BRANCH_LENGTH = 255;
  private static readonly MAX_TOKEN_LENGTH = 4096;

  /**
   * Normalizes a repository URL for validation/storage.
   * Trims whitespace, removes trailing slashes, and strips query/fragment.
   */
  public static normalizeRepositoryUrl(url: string | undefined | null): string | undefined {
    if (typeof url !== "string") {
      return undefined;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      return undefined;
    }
    // Drop query/fragment; keep scheme/authority/path for git remotes.
    const withoutQuery = trimmed.replace(/[?#].*$/, "");
    return withoutQuery.replace(/\/+$/, "");
  }

  /**
   * Validates branch name conservatively (no spaces, no .., no leading/trailing slash).
   */
  public static isValidBranch(branch: string | undefined | null): boolean {
    if (typeof branch !== "string") {
      return false;
    }
    const value = branch.trim();
    if (!value || value.length > CloudSettings.MAX_BRANCH_LENGTH) {
      return false;
    }
    if (/\s|\.{2}|^\/|\/$|\/\/|@{|\\|\~|\^|:|\?|\*|\[/.test(value)) {
      return false;
    }
    return true;
  }

  public refreshExtensionVersion(): void {
    this.extensionVersion = "v" + Environment.getVersion();
  }

  /**
   * Parses repositoryUrl into repositoryOwner/repositoryName.
   * Clears derived fields first to avoid stale state.
   *
   * Supports:
   * - HTTPS(S): https://host/owner/repo(.git)
   * - SCP-like SSH: git@host:owner/repo(.git)
   * - ssh://git@host/owner/repo(.git)
   *
   * For generic providers, repositoryName is the last path segment and
   * repositoryOwner is the remaining path prefix (supports subgroups).
   */
  public parseRepositoryUrl(): void {
    this.repositoryOwner = undefined;
    this.repositoryName = undefined;

    const normalized = CloudSettings.normalizeRepositoryUrl(this.repositoryUrl);
    this.repositoryUrl = normalized;
    if (!normalized) {
      return;
    }

    let pathPart: string | undefined;

    // SCP-like: git@github.com:owner/repo.git
    const scpMatch = normalized.match(/^[\w.-]+@[\w.-]+:(.+)$/);
    if (scpMatch) {
      pathPart = scpMatch[1];
    } else {
      try {
        const parsed = new URL(normalized);
        if (!/^https?:$|^ssh:$|^git:$/.test(parsed.protocol)) {
          return;
        }
        pathPart = parsed.pathname.replace(/^\/+/, "");
      } catch {
        // Fallback: treat as host:path-like or plain path.
        const colonIdx = normalized.indexOf(":");
        pathPart = colonIdx >= 0 && !normalized.startsWith("http")
          ? normalized.slice(colonIdx + 1)
          : normalized;
      }
    }

    if (!pathPart) {
      return;
    }

    const cleanPath = pathPart.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
    const segments = cleanPath.split("/").filter(Boolean);
    if (segments.length < 2) {
      return;
    }

    this.repositoryName = segments[segments.length - 1];
    this.repositoryOwner = segments.slice(0, -1).join("/");
  }

  /**
   * Validates repository configuration shape. Does not validate remote access.
   */
  public isRepositoryConfigValid(): boolean {
    const normalized = CloudSettings.normalizeRepositoryUrl(this.repositoryUrl);
    if (!normalized || normalized.length > CloudSettings.MAX_URL_LENGTH) {
      return false;
    }

    const httpsOrSshUrl =
      /^https:\/\/[\w.-]+(?::\d+)?\/.+$/i.test(normalized) ||
      /^ssh:\/\/[\w.@-]+(?:\/[\w.-]+)?\/.+$/i.test(normalized) ||
      /^git:\/\/[\w.-]+(?::\d+)?\/.+$/i.test(normalized);
    const scpLike = /^[\w.-]+@[\w.-]+:[\w./-]+$/i.test(normalized);
    if (!httpsOrSshUrl && !scpLike) {
      return false;
    }

    if (!CloudSettings.isValidBranch(this.branch ?? CloudSettings.DEFAULT_BRANCH)) {
      return false;
    }

    // Ensure owner/repo can be derived when URL is present.
    const probe = new CloudSettings();
    probe.repositoryUrl = normalized;
    probe.parseRepositoryUrl();
    return !!probe.repositoryOwner && !!probe.repositoryName;
  }

  public hasValidAuthentication(): boolean {
    if (!this.useAuthentication) {
      return true;
    }
    if (typeof this.token !== "string") {
      return false;
    }
    const token = this.token.trim();
    return token.length > 0 && token.length <= CloudSettings.MAX_TOKEN_LENGTH;
  }

  /**
   * True when repository URL, derived owner/name, branch, and auth (if enabled)
   * are valid for an upload attempt.
   */
  public isReadyForRepositoryUpload(): boolean {
    return this.isRepositoryConfigValid() && this.hasValidAuthentication();
  }

  /**
   * Plain object for backup/commit payloads. Excludes secrets.
   */
  public toBackupObject(): Record<string, unknown> {
    const normalizedUrl = CloudSettings.normalizeRepositoryUrl(this.repositoryUrl);
    return {
      lastUpload: this.toIsoDate(this.lastUpload),
      extensionVersion: this.extensionVersion,
      repositoryUrl: normalizedUrl,
      repositoryOwner: this.repositoryOwner,
      repositoryName: this.repositoryName,
      branch: CloudSettings.isValidBranch(this.branch)
        ? this.branch.trim()
        : CloudSettings.DEFAULT_BRANCH,
      useAuthentication: !!this.useAuthentication,
      autoBackupBeforeUpload: !!this.autoBackupBeforeUpload,
      lastRepositorySync: this.toIsoDate(this.lastRepositorySync),
    };
  }

  /**
   * Safe representation for diagnostics; never includes token value.
   */
  public sanitizeForLog(): Record<string, unknown> {
    return {
      ...this.toBackupObject(),
      hasToken: !!(this.token && this.token.trim()),
    };
  }

  /**
   * JSON serialization hook: excludes token by default.
   */
  public toJSON(): Record<string, unknown> {
    return this.toBackupObject();
  }

  private toIsoDate(value: Date | string | null | undefined): string | null {
    if (value == null) {
      return null;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const date = new Date(trimmed);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    return null;
  }
}