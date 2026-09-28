import { request } from "https";
import { URL } from "url";
import { providerUrl, RepositorySettings, validateRemote } from "./transport";

export type ProviderRequest = (
  url: URL,
  headers: { [name: string]: string },
  body: string
) => Promise<{ [name: string]: unknown }>;

const requestJson: ProviderRequest = (url, headers, body) =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      response => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
          if (text.length > 1024 * 1024) {
            req.destroy(new Error("Provider response is too large."));
          }
        });
        response.on("end", () => {
          if (response.statusCode !== 201) {
            reject(
              new Error(
                "Repository creation failed (HTTP " +
                  String(response.statusCode) +
                  "). Check token permissions, API URL and repository name."
              )
            );
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (_) {
            reject(new Error("The provider returned invalid JSON."));
          }
        });
        response.on("error", () =>
          reject(new Error("Provider response failed."))
        );
      }
    );
    req.on("error", () =>
      reject(new Error("Unable to contact the repository provider."))
    );
    req.setTimeout(30000, () =>
      req.destroy(new Error("Provider request timed out."))
    );
    req.end(body);
  });

/** Create a private repository in the authenticated user's own namespace. */
export async function createRepository(
  settings: RepositorySettings,
  send: ProviderRequest = requestJson
): Promise<string> {
  const api = providerUrl(settings);
  if (
    !settings.token ||
    /[\r\n]/.test(settings.token) ||
    !/^[\w.-]+$/.test(settings.name) ||
    [".", ".."].includes(settings.name)
  ) {
    throw new Error("Enter a provider token and a valid new repository name.");
  }
  const github = settings.provider === "github";
  const url = new URL(
    api.href.replace(/\/$/, "") + (github ? "/user/repos" : "/projects")
  );
  const headers = github
    ? {
        Authorization: "Bearer " + settings.token,
        Accept: "application/vnd.github+json"
      }
    : { "PRIVATE-TOKEN": settings.token, Accept: "application/json" };
  const body = github
    ? { name: settings.name, private: true, auto_init: false }
    : {
        name: settings.name,
        path: settings.name,
        visibility: "private",
        initialize_with_readme: false
      };
  const result = await send(
    url,
    { ...headers, "User-Agent": "vscode-settings-sync" },
    JSON.stringify(body)
  );
  const remote = result[github ? "clone_url" : "http_url_to_repo"];
  if (typeof remote !== "string") {
    throw new Error("The provider did not return a repository clone URL.");
  }
  validateRemote(remote);
  // Require the advertised clone host to match before this URL can receive a token.
  const expected =
    api.hostname === "api.github.com" && github ? "github.com" : api.hostname;
  if (
    new URL(remote).protocol !== "https:" ||
    new URL(remote).hostname !== expected ||
    new URL(remote).port !== api.port
  ) {
    throw new Error("The provider returned an unexpected repository host.");
  }
  return remote;
}
