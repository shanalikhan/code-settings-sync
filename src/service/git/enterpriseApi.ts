import { request as httpsRequest } from "https";
import { URL } from "url";

/**
 * GitHub Enterprise and GitLab Enterprise HTTPS calls for repository sync.
 *
 * `apiUrl` is the API root, such as https://github.example/api/v3 or
 * https://gitlab.example/api/v4. The token is sent only to that origin.
 * Redirects are not followed, and a pagination link on any other origin is
 * refused before a request is opened. HTTPS clone URLs are returned only when
 * their host matches; the token is never copied into them or into errors.
 *
 * File transfer is one `settings-sync.json` on a named branch, through the
 * GitHub Contents API or the GitLab Files API. A missing branch is created
 * from the repository default branch when that branch exists. The upload
 * replaces the file with a new commit; it does not rewrite history. A GitHub
 * contents update that returns HTTP 409 is retried once with the blob SHA
 * from a fresh read of the same file. A GitLab write is followed by one read
 * when the write response has no blob id. Download URLs and other links in a
 * response are not followed. Certificate verification stays enabled.
 */

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_LIST_PAGES = 10;
const REQUEST_TIMEOUT_MS = 30000;
const SETTINGS_SYNC_FILE = "settings-sync.json";
const SETTINGS_COMMIT_MESSAGE = "Update settings-sync.json";

export { SETTINGS_SYNC_FILE };

export interface EnterpriseApiSettings {
  provider: string;
  apiUrl: string;
  token: string;
}

export interface EnterpriseRepository {
  name: string;
  cloneUrl: string;
  private: boolean;
}

export interface EnterpriseResponse {
  statusCode: number;
  headers: { [name: string]: string | string[] | undefined };
  body: string;
}

export interface EnterpriseTransport {
  (
    url: URL,
    method: "GET" | "POST" | "PUT",
    headers: { [name: string]: string },
    body?: string
  ): Promise<EnterpriseResponse>;
}

export interface EnterpriseSettingsTarget {
  /** GitHub `owner/name`, or a GitLab project id or `group/name` path. */
  repository: string;
  branch: string;
}

export interface EnterpriseSettingsFile {
  content: string;
  branch: string;
  /** GitHub blob SHA or GitLab blob id. Null when the provider did not return one. */
  sha: string | null;
}

export interface EnterpriseCallOptions {
  /** Extra CA material. Certificate verification stays enabled. */
  ca?: string | Buffer | Array<string | Buffer>;
  /** Replaces the HTTPS client. Host checks still run before it is called. */
  transport?: EnterpriseTransport;
}

interface ValidatedApi {
  provider: "github" | "gitlab";
  api: URL;
  token: string;
}

export async function createPrivateRepository(
  settings: EnterpriseApiSettings,
  repositoryName: string,
  options?: EnterpriseCallOptions
): Promise<EnterpriseRepository> {
  const validated = validateSettings(settings);
  if (!isRepositoryName(repositoryName)) {
    throw new Error(
      "Enter a repository name using letters, numbers, dots, underscores, or hyphens."
    );
  }
  const endpoint = joinApi(
    validated.api,
    validated.provider === "github" ? "/user/repos" : "/projects"
  );
  const payload =
    validated.provider === "github"
      ? { name: repositoryName, private: true, auto_init: false }
      : {
          name: repositoryName,
          path: repositoryName,
          visibility: "private",
          initialize_with_readme: false
        };
  const response = await callApi(
    validated,
    options,
    endpoint,
    "POST",
    JSON.stringify(payload)
  );
  if (isRedirect(response.statusCode)) {
    throw new Error(
      "The enterprise API redirected the request. Refusing to follow it with the token."
    );
  }
  if (response.statusCode !== 201) {
    throw new Error(httpFailure(response.statusCode));
  }
  const created = parseRepository(validated, parseObject(response.body), repositoryName);
  // "Create Private Repository and Use It" must never route sensitive settings
  // into a provider-created public or internal repository.
  if (!created.private) {
    throw new Error(
      "The provider created a non-private repository. Review its visibility before syncing."
    );
  }
  return created;
}

export async function listOwnedRepositories(
  settings: EnterpriseApiSettings,
  options?: EnterpriseCallOptions
): Promise<EnterpriseRepository[]> {
  const validated = validateSettings(settings);
  const query =
    validated.provider === "github"
      ? "per_page=100&affiliation=owner"
      : "owned=true&simple=true&per_page=100";
  let next: URL | null = joinApi(
    validated.api,
    validated.provider === "github" ? "/user/repos" : "/projects",
    query
  );
  const seen: string[] = [];
  const repositories: EnterpriseRepository[] = [];
  let pages = 0;

  while (next) {
    if (pages >= MAX_LIST_PAGES) {
      throw new Error("Provider listing exceeded 10 pages.");
    }
    if (seen.indexOf(next.href) !== -1) {
      throw new Error("The provider repeated a listing page.");
    }
    seen.push(next.href);
    pages++;
    const response = await callApi(validated, options, next, "GET");
    if (isRedirect(response.statusCode)) {
      throw new Error(
        "The enterprise API redirected the request. Refusing to follow it with the token."
      );
    }
    if (response.statusCode !== 200) {
      throw new Error(httpFailure(response.statusCode));
    }
    repositories.push(...parseRepositoryList(validated, response.body));
    next = nextPage(validated, response.headers);
  }
  return repositories;
}

export async function getSettingsFile(
  settings: EnterpriseApiSettings,
  target: EnterpriseSettingsTarget,
  options?: EnterpriseCallOptions
): Promise<EnterpriseSettingsFile> {
  const validated = validateSettings(settings);
  const fileTarget = validateTarget(validated, target);
  const response = await requestApi(
    validated,
    options,
    settingsFileUrl(validated, fileTarget, true),
    "GET"
  );
  if (response.statusCode === 404) {
    throw new Error("settings-sync.json was not found on that branch.");
  }
  if (response.statusCode !== 200) {
    throw new Error(httpFailure(response.statusCode));
  }
  return parseSettingsFile(validated, response.body, fileTarget.branch);
}

export async function putSettingsFile(
  settings: EnterpriseApiSettings,
  target: EnterpriseSettingsTarget,
  content: string,
  options?: EnterpriseCallOptions
): Promise<EnterpriseSettingsFile> {
  const validated = validateSettings(settings);
  const fileTarget = validateTarget(validated, target);
  assertSettingsText(content);
  const existing = await readSettingsFile(validated, options, fileTarget);
  if (!existing) {
    await ensureBranch(validated, options, fileTarget);
  }
  return writeSettingsFile(
    validated,
    options,
    fileTarget,
    content,
    existing
  );
}

function validateSettings(settings: EnterpriseApiSettings): ValidatedApi {
  if (settings.provider !== "github" && settings.provider !== "gitlab") {
    throw new Error("Select GitHub or GitLab for the enterprise API.");
  }
  if (!isToken(settings.token)) {
    throw new Error(
      "Enter an enterprise API token without spaces or line breaks."
    );
  }
  return {
    provider: settings.provider,
    api: parseApiRoot(settings.apiUrl),
    token: settings.token
  };
}

function parseApiRoot(apiUrl: string): URL {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch (_) {
    throw new Error(apiUrlMessage());
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname
  ) {
    throw new Error(apiUrlMessage());
  }
  return url;
}

function apiUrlMessage(): string {
  return "The enterprise API URL must be HTTPS without credentials, a query, or a fragment.";
}

function isToken(token: string): boolean {
  return (
    typeof token === "string" && /^[^\s]+$/.test(token) && token.length <= 4096
  );
}

function isRepositoryName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name);
}

function joinApi(api: URL, suffix: string, query?: string): URL {
  if (
    suffix.charAt(0) !== "/" ||
    suffix.indexOf("..") !== -1 ||
    /[?#\\\s@]/.test(suffix)
  ) {
    throw new Error(
      "Refusing to send the token to an unsafe repository API URL."
    );
  }
  const endpoint = new URL(api.href);
  const basePath = endpoint.pathname.replace(/\/+$/, "");
  endpoint.pathname = basePath + suffix;
  endpoint.search = query ? "?" + query : "";
  endpoint.hash = "";
  assertTokenHost(api, endpoint);
  return endpoint;
}

function assertTokenHost(api: URL, target: URL): void {
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.hash
  ) {
    throw new Error(
      "Refusing to send the token to an unsafe repository API URL."
    );
  }
  if (originOf(api) !== originOf(target)) {
    throw new Error("Refusing to send the token to a different host.");
  }
}

function originOf(url: URL): string {
  return url.protocol + "//" + url.hostname + ":" + portOf(url);
}

function portOf(url: URL): string {
  if (url.port) {
    return url.port;
  }
  return url.protocol === "https:" ? "443" : "";
}

function tokenHeaders(validated: ValidatedApi): { [name: string]: string } {
  const headers: { [name: string]: string } = {
    Accept:
      validated.provider === "github"
        ? "application/vnd.github+json"
        : "application/json",
    "User-Agent": "code-settings-sync"
  };
  if (validated.provider === "github") {
    headers.Authorization = "token " + validated.token;
  } else {
    headers["PRIVATE-TOKEN"] = validated.token;
  }
  return headers;
}

async function requestApi(
  validated: ValidatedApi,
  options: EnterpriseCallOptions | undefined,
  url: URL,
  method: "GET" | "POST" | "PUT",
  body?: string
): Promise<EnterpriseResponse> {
  const response = await callApi(validated, options, url, method, body);
  if (isRedirect(response.statusCode)) {
    throw new Error(
      "The enterprise API redirected the request. Refusing to follow it with the token."
    );
  }
  return response;
}

async function callApi(
  validated: ValidatedApi,
  options: EnterpriseCallOptions | undefined,
  url: URL,
  method: "GET" | "POST" | "PUT",
  body?: string
): Promise<EnterpriseResponse> {
  assertTokenHost(validated.api, url);
  if (url.href.indexOf(validated.token) !== -1) {
    throw new Error(
      "Refusing to send the token to an unsafe repository API URL."
    );
  }
  const headers = tokenHeaders(validated);
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(Buffer.byteLength(body));
  }
  const transport =
    options && options.transport
      ? options.transport
      : nodeTransport(options && options.ca);
  try {
    return await transport(url, method, headers, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message || message.indexOf(validated.token) !== -1) {
      throw new Error("The enterprise API request failed.");
    }
    throw new Error(message);
  }
}

function nodeTransport(ca: EnterpriseCallOptions["ca"]): EnterpriseTransport {
  return (url, method, headers, body) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };
      const req = httpsRequest(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method,
          headers,
          ca,
          servername: ipHostname(url.hostname) ? undefined : url.hostname
        },
        response => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              req.destroy();
              fail(new Error("The provider response is too large."));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            if (settled) {
              return;
            }
            settled = true;
            resolve({
              statusCode: response.statusCode || 0,
              headers: response.headers,
              body: Buffer.concat(chunks).toString("utf8")
            });
          });
          response.on("error", () => {
            fail(new Error("The enterprise API request failed."));
          });
        }
      );
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        fail(new Error("The enterprise API request timed out."));
      });
      req.on("error", error => {
        fail(
          new Error(
            error && error.message
              ? error.message
              : "The enterprise API request failed."
          )
        );
      });
      req.end(body);
    });
}

function ipHostname(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

function isRedirect(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].indexOf(statusCode) !== -1;
}

function httpFailure(statusCode: number): string {
  return "Enterprise API request failed (HTTP " + String(statusCode) + ").";
}

function parseObject(
  body: string,
  message = "The provider returned an unexpected repository."
): { [key: string]: unknown } {
  return asRecord(parseJson(body), message);
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (_) {
    throw new Error("The provider returned invalid JSON.");
  }
}

function parseRepositoryList(
  validated: ValidatedApi,
  body: string
): EnterpriseRepository[] {
  const value = parseJson(body);
  if (!Array.isArray(value)) {
    throw new Error("The provider returned an unexpected repository list.");
  }
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("The provider returned an unexpected repository.");
    }
    return parseRepository(validated, item as { [key: string]: unknown });
  });
}

function parseRepository(
  validated: ValidatedApi,
  record: { [key: string]: unknown },
  expectedName?: string
): EnterpriseRepository {
  const name =
    validated.provider === "github" ? record.name : record.path || record.name;
  const cloneUrl =
    validated.provider === "github"
      ? record.clone_url
      : record.http_url_to_repo;
  const isPrivate =
    validated.provider === "github"
      ? record.private
      : gitlabPrivate(record.visibility);
  if (typeof name !== "string" || !isRepositoryName(name)) {
    throw new Error("The provider returned an unexpected repository.");
  }
  if (expectedName && name !== expectedName) {
    throw new Error("The provider returned a different repository name.");
  }
  if (typeof isPrivate !== "boolean") {
    throw new Error("The provider returned an unexpected repository.");
  }
  return {
    name,
    cloneUrl: acceptedCloneUrl(validated, cloneUrl),
    private: isPrivate
  };
}

function gitlabPrivate(visibility: unknown): boolean | null {
  if (visibility === "private") {
    return true;
  }
  if (visibility === "public" || visibility === "internal") {
    return false;
  }
  return null;
}

function acceptedCloneUrl(validated: ValidatedApi, value: unknown): string {
  if (typeof value !== "string" || value.indexOf(validated.token) !== -1) {
    throw new Error(
      typeof value === "string" && value.indexOf(validated.token) !== -1
        ? "The provider returned a clone URL that contains the token."
        : "The provider did not return an HTTPS clone URL."
    );
  }
  let remote: URL;
  try {
    remote = new URL(value);
  } catch (_) {
    throw new Error("The provider did not return an HTTPS clone URL.");
  }
  if (
    remote.protocol !== "https:" ||
    remote.username ||
    remote.password ||
    remote.search ||
    remote.hash ||
    /\s/.test(value)
  ) {
    throw new Error("The provider did not return an HTTPS clone URL.");
  }
  const expectedHost =
    validated.provider === "github" &&
    validated.api.hostname === "api.github.com"
      ? "github.com"
      : validated.api.hostname;
  if (
    remote.hostname !== expectedHost ||
    portOf(remote) !== portOf(validated.api)
  ) {
    throw new Error("The provider returned a repository on a different host.");
  }
  return remote.href;
}

function nextPage(
  validated: ValidatedApi,
  headers: EnterpriseResponse["headers"]
): URL | null {
  const header = headers.link;
  const link = Array.isArray(header) ? header.join(",") : header || "";
  if (!link) {
    return null;
  }
  const parts = link.split(",");
  let target: string | null = null;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!/rel="?next"?/i.test(part)) {
      continue;
    }
    const match = /<([^>]+)>/.exec(part);
    if (match) {
      target = match[1];
      break;
    }
  }
  if (!target) {
    return null;
  }
  if (target.indexOf(validated.token) !== -1) {
    throw new Error(
      "Refusing to send the token to an unsafe repository API URL."
    );
  }
  let url: URL;
  try {
    url = new URL(target);
  } catch (_) {
    throw new Error("The provider returned an invalid pagination link.");
  }
  assertTokenHost(validated.api, url);
  return url;
}

interface FileTarget {
  repository: string;
  branch: string;
  prefix: string;
}

interface ExistingSettingsFile {
  sha: string;
  content: string;
  lastCommitId: string | null;
}

function validateTarget(
  validated: ValidatedApi,
  target: EnterpriseSettingsTarget
): FileTarget {
  if (
    !target ||
    typeof target.repository !== "string" ||
    typeof target.branch !== "string"
  ) {
    throw new Error("Enter a repository and branch for settings-sync.json.");
  }
  if (!isBranchName(target.branch)) {
    throw new Error(
      "Enter a branch name using letters, numbers, dots, underscores, hyphens, or slashes."
    );
  }
  const prefix = repositoryPrefix(validated, target.repository);
  if (
    target.repository.indexOf(validated.token) !== -1 ||
    target.branch.indexOf(validated.token) !== -1
  ) {
    throw new Error(
      "Refusing to send the token to an unsafe repository API URL."
    );
  }
  return {
    repository: target.repository,
    branch: target.branch,
    prefix
  };
}

function repositoryPrefix(validated: ValidatedApi, repository: string): string {
  if (validated.provider === "github") {
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]{0,99})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})$/.exec(
      repository
    );
    if (!match) {
      throw new Error("Enter a GitHub repository as owner/name.");
    }
    return (
      "/repos/" +
      encodeURIComponent(match[1]) +
      "/" +
      encodeURIComponent(match[2])
    );
  }
  if (/^[1-9][0-9]{0,18}$/.test(repository)) {
    return "/projects/" + repository;
  }
  const parts = repository.split("/");
  if (
    parts.length < 2 ||
    parts.length > 20 ||
    !parts.every(part => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(part))
  ) {
    throw new Error("Enter a GitLab project id or group/name.");
  }
  return "/projects/" + encodeURIComponent(repository);
}

function isBranchName(branch: string): boolean {
  if (
    branch.length === 0 ||
    branch.length > 128 ||
    branch.indexOf("..") !== -1
  ) {
    return false;
  }
  const parts = branch.split("/");
  if (parts.length > 10) {
    return false;
  }
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(part) ||
      part.charAt(part.length - 1) === "." ||
      /\.lock$/i.test(part)
    ) {
      return false;
    }
  }
  return true;
}

function assertSettingsText(content: string): void {
  if (typeof content !== "string") {
    throw new Error("The settings file must be text.");
  }
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
    throw new Error("The settings file is too large.");
  }
}

function settingsFileUrl(
  validated: ValidatedApi,
  target: FileTarget,
  withRef: boolean
): URL {
  const suffix =
    target.prefix +
    (validated.provider === "github" ? "/contents/" : "/repository/files/") +
    SETTINGS_SYNC_FILE;
  return joinApi(
    validated.api,
    suffix,
    withRef ? "ref=" + encodeURIComponent(target.branch) : undefined
  );
}

function branchUrl(validated: ValidatedApi, target: FileTarget): URL {
  const suffix =
    target.prefix +
    (validated.provider === "github" ? "/branches/" : "/repository/branches/") +
    encodeURIComponent(target.branch);
  return joinApi(validated.api, suffix);
}

async function readSettingsFile(
  validated: ValidatedApi,
  options: EnterpriseCallOptions | undefined,
  target: FileTarget
): Promise<ExistingSettingsFile | null> {
  const response = await requestApi(
    validated,
    options,
    settingsFileUrl(validated, target, true),
    "GET"
  );
  if (response.statusCode === 404) {
    return null;
  }
  if (response.statusCode !== 200) {
    throw new Error(httpFailure(response.statusCode));
  }
  const file = parseSettingsFile(validated, response.body, target.branch);
  if (!file.sha) {
    throw new Error("The provider returned an unexpected file id.");
  }
  const lastCommitId =
    validated.provider === "gitlab"
      ? requiredSha(
          parseObject(response.body).last_commit_id,
          "The provider did not return a file last_commit_id."
        )
      : null;
  return { sha: file.sha, content: file.content, lastCommitId };
}

async function ensureBranch(
  validated: ValidatedApi,
  options: EnterpriseCallOptions | undefined,
  target: FileTarget
): Promise<void> {
  const probe = await requestApi(
    validated,
    options,
    branchUrl(validated, target),
    "GET"
  );
  if (probe.statusCode === 200) {
    assertBranchRecord(probe.body, target.branch);
    return;
  }
  if (probe.statusCode !== 404) {
    throw new Error(httpFailure(probe.statusCode));
  }
  const metadata = await requestApi(
    validated,
    options,
    joinApi(validated.api, target.prefix),
    "GET"
  );
  if (metadata.statusCode !== 200) {
    throw new Error(httpFailure(metadata.statusCode));
  }
  const defaultBranch = parseDefaultBranch(metadata.body);
  if (!defaultBranch) {
    return;
  }
  if (defaultBranch === target.branch) {
    throw new Error(
      "The repository has no default branch to create the requested branch from."
    );
  }
  await createBranch(validated, options, target, defaultBranch);
}

async function createBranch(
  validated: ValidatedApi,
  options: EnterpriseCallOptions | undefined,
  target: FileTarget,
  defaultBranch: string
): Promise<void> {
  if (validated.provider === "github") {
    const current = await requestApi(
      validated,
      options,
      joinApi(
        validated.api,
        target.prefix + "/git/ref/heads/" + encodeURIComponent(defaultBranch)
      ),
      "GET"
    );
    if (current.statusCode !== 200) {
      throw new Error(httpFailure(current.statusCode));
    }
    const sha = parseCommitSha(current.body);
    const created = await requestApi(
      validated,
      options,
      joinApi(validated.api, target.prefix + "/git/refs"),
      "POST",
      JSON.stringify({
        ref: "refs/heads/" + target.branch,
        sha
      })
    );
    if (created.statusCode !== 201) {
      throw new Error(httpFailure(created.statusCode));
    }
    assertCreatedRef(created.body, target.branch, sha);
    return;
  }
  const created = await requestApi(
    validated,
    options,
    joinApi(validated.api, target.prefix + "/repository/branches"),
    "POST",
    JSON.stringify({
      branch: target.branch,
      ref: defaultBranch
    })
  );
  if (created.statusCode !== 201) {
    throw new Error(httpFailure(created.statusCode));
  }
  assertBranchRecord(created.body, target.branch);
}

async function writeSettingsFile(
  validated: ValidatedApi,
  options: EnterpriseCallOptions | undefined,
  target: FileTarget,
  content: string,
  existing: ExistingSettingsFile | null
): Promise<EnterpriseSettingsFile> {
  if (validated.provider === "github") {
    return putGithubSettingsFile(
      validated,
      options,
      target,
      content,
      existing ? existing.sha : null,
      false,
      existing ? existing.content : null
    );
  }
  const payload: { [key: string]: string } = {
    branch: target.branch,
    content,
    commit_message: SETTINGS_COMMIT_MESSAGE,
    encoding: "text"
  };
  // GitLab's PUT accepts this file-specific optimistic-concurrency key.
  // Never clobber a newer remote edit between the GET and the upload.
  if (existing && existing.lastCommitId) {
    payload.last_commit_id = existing.lastCommitId;
  }
  const response = await requestApi(
    validated,
    options,
    settingsFileUrl(validated, target, false),
    existing ? "PUT" : "POST",
    JSON.stringify(payload)
  );
  if (response.statusCode !== 200 && response.statusCode !== 201) {
    throw new Error(httpFailure(response.statusCode));
  }
  parseGitlabWrite(response.body, target.branch);
  const confirmed = await readSettingsFile(validated, options, target);
  // GitLab's write reply omits the stored blob id. Verify the read-back
  // content as well as its SHA so a subsequent writer is never represented
  // as our successful upload.
  if (!confirmed || confirmed.content !== content) {
    throw new Error("Remote settings changed after upload; refresh before retrying.");
  }
  return {
    content,
    branch: target.branch,
    sha: confirmed.sha
  };
}

async function putGithubSettingsFile(
  validated: ValidatedApi,
  options: EnterpriseCallOptions | undefined,
  target: FileTarget,
  content: string,
  sha: string | null,
  retried: boolean,
  originalContent: string | null
): Promise<EnterpriseSettingsFile> {
  const payload: { [key: string]: string } = {
    message: SETTINGS_COMMIT_MESSAGE,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: target.branch
  };
  if (sha) {
    payload.sha = sha;
  }
  const response = await requestApi(
    validated,
    options,
    settingsFileUrl(validated, target, false),
    "PUT",
    JSON.stringify(payload)
  );
  if (response.statusCode === 409 && !retried) {
    const current = await readSettingsFile(validated, options, target);
    if (current && current.content === content) {
      // Another writer already stored these exact bytes; no second write.
      return { content, branch: target.branch, sha: current.sha };
    }
    if (!current || originalContent === null || current.content !== originalContent) {
      throw new Error("Remote settings changed during upload; refresh before overwriting.");
    }
    return putGithubSettingsFile(
      validated,
      options,
      target,
      content,
      current.sha,
      true,
      originalContent
    );
  }
  if (response.statusCode !== 200 && response.statusCode !== 201) {
    throw new Error(httpFailure(response.statusCode));
  }
  return {
    content,
    branch: target.branch,
    sha: parseGithubWriteSha(response.body)
  };
}

function parseSettingsFile(
  validated: ValidatedApi,
  body: string,
  branch: string
): EnterpriseSettingsFile {
  const record = parseObject(
    body,
    "The provider did not return settings-sync.json."
  );
  const shaField = validated.provider === "github" ? "sha" : "blob_id";
  if (validated.provider === "github") {
    if (record.type !== undefined && record.type !== "file") {
      throw new Error("The provider did not return settings-sync.json.");
    }
    assertFilePath(record, "path", "name");
  } else {
    assertFilePath(record, "file_path", "file_name");
    if (typeof record.ref === "string" && record.ref !== branch) {
      throw new Error("The provider returned a different branch.");
    }
  }
  if (record.encoding !== "base64") {
    throw new Error("The provider did not return the settings file inline.");
  }
  return {
    content: decodeBase64Content(record.content),
    branch,
    sha: requiredSha(
      record[shaField],
      "The provider returned an unexpected file id."
    )
  };
}

function assertFilePath(
  record: { [key: string]: unknown },
  pathKey: string,
  nameKey: string
): void {
  if (record[pathKey] !== SETTINGS_SYNC_FILE) {
    throw new Error("The provider did not return settings-sync.json.");
  }
  if (record[nameKey] !== undefined && record[nameKey] !== SETTINGS_SYNC_FILE) {
    throw new Error("The provider did not return settings-sync.json.");
  }
}

function decodeBase64Content(value: unknown): string {
  if (typeof value !== "string" || /[^A-Za-z0-9+/=\s]/.test(value)) {
    throw new Error("The provider did not return the settings file inline.");
  }
  const compact = value.replace(/\s+/g, "");
  if (compact.length % 4 !== 0) {
    throw new Error("The provider did not return the settings file inline.");
  }
  const decoded = Buffer.from(compact, "base64");
  if (decoded.length > MAX_FILE_BYTES) {
    throw new Error("The settings file is too large.");
  }
  const text = decoded.toString("utf8");
  if (!decoded.equals(Buffer.from(text, "utf8"))) {
    throw new Error("The provider did not return the settings file as text.");
  }
  return text;
}

function requiredSha(value: unknown, message: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/i.test(value)) {
    throw new Error(message);
  }
  return value.toLowerCase();
}

function parseGithubWriteSha(body: string): string {
  const record = parseObject(
    body,
    "The provider did not return settings-sync.json."
  );
  const content = asRecord(
    record.content,
    "The provider did not return settings-sync.json."
  );
  assertFilePath(content, "path", "name");
  return requiredSha(
    content.sha,
    "The provider returned an unexpected file id."
  );
}

function parseGitlabWrite(body: string, branch: string): void {
  const record = parseObject(
    body,
    "The provider did not return settings-sync.json."
  );
  assertFilePath(record, "file_path", "file_name");
  if (record.branch !== branch) {
    throw new Error("The provider returned a different branch.");
  }
}

function assertBranchRecord(body: string, branch: string): void {
  const record = parseObject(
    body,
    "The provider returned an unexpected branch."
  );
  if (record.name !== branch) {
    throw new Error("The provider returned a different branch.");
  }
}

function parseDefaultBranch(body: string): string | null {
  const record = parseObject(
    body,
    "The provider returned an unexpected repository."
  );
  if (record.default_branch === null || record.default_branch === undefined) {
    return null;
  }
  if (
    typeof record.default_branch !== "string" ||
    !isBranchName(record.default_branch)
  ) {
    throw new Error("The provider returned an unexpected default branch.");
  }
  return record.default_branch;
}

function parseCommitSha(body: string): string {
  const record = parseObject(
    body,
    "The provider returned an unexpected commit."
  );
  const object = asRecord(
    record.object,
    "The provider returned an unexpected commit."
  );
  if (object.type !== undefined && object.type !== "commit") {
    throw new Error("The provider returned an unexpected commit.");
  }
  return requiredSha(object.sha, "The provider returned an unexpected commit.");
}

function assertCreatedRef(body: string, branch: string, sha: string): void {
  const record = parseObject(
    body,
    "The provider returned an unexpected branch."
  );
  if (record.ref !== "refs/heads/" + branch) {
    throw new Error("The provider returned a different branch.");
  }
  const object = asRecord(
    record.object,
    "The provider returned an unexpected branch."
  );
  if (typeof object.sha !== "string" || object.sha.toLowerCase() !== sha) {
    throw new Error("The provider returned a different commit.");
  }
}

function asRecord(value: unknown, message: string): { [key: string]: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as { [key: string]: unknown };
}
