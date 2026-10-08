import { URL } from "url";
import { RepositorySyncConfig } from "../../models/repositorySyncConfig.model";

/** Validate a complete settings-page snapshot without coercing message values. */
export function repositorySettingsFromMessage(
  input: unknown,
  create: boolean
): RepositorySyncConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Enter the repository settings before saving.");
  }
  const values = input as { [key: string]: unknown };
  const setting = new RepositorySyncConfig();
  const fields = [
    "mode",
    "provider",
    "apiUrl",
    "token",
    "repository",
    "remoteUrl",
    "branch"
  ];
  fields.forEach(field => {
    if (
      !Object.prototype.hasOwnProperty.call(values, field) ||
      typeof values[field] !== "string"
    ) {
      throw new Error("Repository settings must contain text values.");
    }
  });
  if (values.mode !== "gist" && values.mode !== "repository") {
    throw new Error("Select Gist or Git repository for sync storage.");
  }
  if (values.provider !== "github" && values.provider !== "gitlab") {
    throw new Error("Select GitHub or GitLab for the repository provider.");
  }
  setting.mode = values.mode;
  setting.provider = values.provider;
  setting.apiUrl = (values.apiUrl as string).trim();
  setting.token = values.token as string;
  setting.repository = (values.repository as string).trim();
  setting.remoteUrl = (values.remoteUrl as string).trim();
  setting.branch = (values.branch as string).trim();

  // Returning to Gist must remain possible with unfinished repository settings.
  if (setting.mode === "gist" && !create) {
    return setting;
  }
  validateBranch(values.branch as string, setting.branch);
  if (!create) {
    validateRemote(values.remoteUrl as string, setting.remoteUrl);
    return setting;
  }

  let api: URL;
  try {
    api = new URL(setting.apiUrl);
  } catch (_) {
    throw new Error(
      "Enter an HTTPS API URL without credentials, a query or a fragment."
    );
  }
  if (
    /[\x00-\x1f\x7f]/.test(values.apiUrl as string) ||
    api.protocol !== "https:" ||
    !api.hostname ||
    api.username ||
    api.password ||
    api.search ||
    api.hash
  ) {
    throw new Error(
      "Enter an HTTPS API URL without credentials, a query or a fragment."
    );
  }
  if (!/^[^\s]+$/.test(setting.token) || setting.token.length > 4096) {
    throw new Error("Enter an API credential without spaces or line breaks.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(setting.repository)) {
    throw new Error(
      "Enter a new repository name using letters, numbers, dots, underscores or hyphens."
    );
  }
  return setting;
}

export function validateBranch(raw: string, branch: string): void {
  if (
    !branch ||
    branch === "HEAD" ||
    branch === "@" ||
    branch.charAt(0) === "-" ||
    /[\x00-\x20\x7f~^:?*\[\\]/.test(raw.trim()) ||
    /[\x00-\x1f\x7f]/.test(raw) ||
    branch.indexOf("..") !== -1 ||
    branch.indexOf("@{") !== -1 ||
    branch.charAt(branch.length - 1) === "." ||
    branch
      .split("/")
      .some(part => !part || part.charAt(0) === "." || /\.lock$/.test(part))
  ) {
    throw new Error(
      "Enter a valid Git branch/profile, such as master or office."
    );
  }
}

export function validateRemote(raw: string, remote: string): void {
  const message =
    "Enter an HTTPS, SSH or local Git repository remote without embedded credentials.";
  if (!remote || /[\x00-\x1f\x7f]/.test(raw) || remote.charAt(0) === "-") {
    throw new Error(message);
  }
  if (/^(https|ssh):\/\//i.test(remote)) {
    let url: URL;
    try {
      url = new URL(remote);
    } catch (_) {
      throw new Error(message);
    }
    if (
      !url.hostname ||
      url.password ||
      (url.protocol === "https:" && url.username)
    ) {
      throw new Error(message);
    }
    return;
  }
  // Git's scp-style SSH syntax and local paths do not need an API credential.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(remote) || remote.indexOf("::") !== -1) {
    throw new Error(message);
  }
}
