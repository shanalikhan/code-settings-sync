import { expect } from "chai";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { URL } from "url";

import {
  createPrivateRepository,
  EnterpriseApiSettings,
  EnterpriseResponse,
  EnterpriseSettingsTarget,
  EnterpriseTransport,
  getSettingsFile,
  listOwnedRepositories,
  putSettingsFile
} from "../../../src/service/git/enterpriseApi";

const TOKEN = "local-enterprise-token";
const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";
const FILE_TEXT = '{"version":1,"label":"caf\u00e9"}\n';

describe("enterprise repository API", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "settings-sync-enterprise-")
  );
  const certificate = createCertificate(directory, "enterprise");
  const otherCertificate = createCertificate(directory, "other");

  describe("rejects unsafe settings before opening a request", () => {
    const calls: URL[] = [];
    const transport: EnterpriseTransport = url => {
      calls.push(url);
      return Promise.reject(new Error("transport should not be called"));
    };

    beforeEach(() => {
      calls.length = 0;
    });

    it("requires GitHub or GitLab", async () => {
      await expectRejection(
        createPrivateRepository(
          settings("bitbucket", "https://git.example/api"),
          "repo",
          { transport }
        ),
        "Select GitHub or GitLab for the enterprise API."
      );
      expect(calls).to.have.length(0);
    });

    it("requires an HTTPS API root without credentials or a query", async () => {
      const urls = [
        "http://git.example/api/v3",
        "https://user:secret@git.example/api/v3",
        "https://git.example/api/v3?token=" + TOKEN,
        "https://git.example/api/v3#fragment",
        "not a url"
      ];
      for (let index = 0; index < urls.length; index++) {
        await expectRejection(
          listOwnedRepositories(settings("github", urls[index], TOKEN), {
            transport
          }),
          "The enterprise API URL must be HTTPS without credentials, a query, or a fragment."
        );
      }
      expect(calls).to.have.length(0);
    });

    it("rejects tokens that could break the authorization header", async () => {
      const tokens = [
        "",
        "has space",
        "line\nbreak",
        "return\rtoken",
        " token"
      ];
      for (let index = 0; index < tokens.length; index++) {
        await expectRejection(
          createPrivateRepository(
            settings("gitlab", "https://gitlab.example/api/v4", tokens[index]),
            "settings",
            { transport }
          ),
          "Enter an enterprise API token without spaces or line breaks."
        );
      }
      expect(calls).to.have.length(0);
    });

    it("rejects repository names that are not a single path segment", async () => {
      await expectRejection(
        createPrivateRepository(
          settings("github", "https://git.example/api/v3", TOKEN),
          "../settings",
          { transport }
        ),
        "Enter a repository name using letters, numbers, dots, underscores, or hyphens."
      );
      expect(calls).to.have.length(0);
    });
  });

  describe("confines clone URLs and pagination to the API host", () => {
    it("accepts a github.com clone URL only for api.github.com", async () => {
      const created = await createPrivateRepository(
        settings("github", "https://api.github.com", TOKEN),
        "settings",
        {
          transport: fixed(201, {
            name: "settings",
            private: true,
            clone_url: "https://github.com/me/settings.git"
          })
        }
      );
      expect(created.cloneUrl).to.equal("https://github.com/me/settings.git");
      expect(created.private).to.equal(true);

      await expectRejection(
        createPrivateRepository(
          settings("github", "https://api.github.com", TOKEN),
          "settings",
          {
            transport: fixed(201, {
              name: "settings",
              private: true,
              clone_url: "https://github.example/me/settings.git"
            })
          }
        ),
        "The provider returned a repository on a different host."
      );
    });

    it("refuses a GitHub repository that was not actually created private", async () => {
      await expectRejection(
        createPrivateRepository(
          settings("github", "https://api.github.com", TOKEN),
          "settings",
          {
            transport: fixed(201, {
              name: "settings",
              private: false,
              clone_url: "https://github.com/me/settings.git"
            })
          }
        ),
        "The provider created a non-private repository. Review its visibility before syncing."
      );
    });

    it("refuses a GitLab project created with internal visibility", async () => {
      await expectRejection(
        createPrivateRepository(
          settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
          "settings",
          {
            transport: fixed(201, {
              path: "settings",
              visibility: "internal",
              http_url_to_repo: "https://gitlab.example/me/settings.git"
            })
          }
        ),
        "The provider created a non-private repository. Review its visibility before syncing."
      );
    });

    it("rejects a public GitHub clone URL for a GitHub Enterprise API", async () => {
      const seen: string[] = [];
      await expectRejection(
        createPrivateRepository(
          settings("github", "https://GitHub.Example/api/v3", TOKEN),
          "settings",
          {
            transport: (url, method, headers, body) => {
              seen.push(url.hostname + " " + method);
              expect(headers.Authorization).to.equal("token " + TOKEN);
              expect(headers["PRIVATE-TOKEN"]).to.equal(undefined);
              expect(url.href.indexOf(TOKEN)).to.equal(-1);
              expect(JSON.parse(body || "{}").private).to.equal(true);
              return jsonResponse(201, {
                name: "settings",
                private: true,
                clone_url: "https://github.com/me/settings.git"
              });
            }
          }
        ),
        "The provider returned a repository on a different host."
      );
      expect(seen).to.deep.equal(["github.example POST"]);
    });

    it("treats an explicit port 443 as the same host and rejects other ports", async () => {
      const created = await createPrivateRepository(
        settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
        "settings",
        {
          transport: fixed(201, {
            path: "settings",
            visibility: "private",
            http_url_to_repo: "https://gitlab.example:443/group/settings.git"
          })
        }
      );
      expect(new URL(created.cloneUrl).hostname).to.equal("gitlab.example");
      expect(new URL(created.cloneUrl).port).to.equal("");

      await expectRejection(
        createPrivateRepository(
          settings("gitlab", "https://gitlab.example:8443/api/v4", TOKEN),
          "settings",
          {
            transport: fixed(201, {
              path: "settings",
              visibility: "private",
              http_url_to_repo: "https://gitlab.example/group/settings.git"
            })
          }
        ),
        "The provider returned a repository on a different host."
      );
    });

    it("does not request a pagination link on another host", async () => {
      const seen: string[] = [];
      await expectRejection(
        listOwnedRepositories(
          settings("github", "https://git.example/api/v3", TOKEN),
          {
            transport: url => {
              seen.push(url.href);
              return jsonResponse(
                200,
                [
                  {
                    name: "settings",
                    private: true,
                    clone_url: "https://git.example/me/settings.git"
                  }
                ],
                {
                  link:
                    '<https://attacker.example/api/v3/user/repos?page=2>; rel="next"'
                }
              );
            }
          }
        ),
        "Refusing to send the token to a different host."
      );
      expect(seen).to.deep.equal([
        "https://git.example/api/v3/user/repos?per_page=100&affiliation=owner"
      ]);
    });

    it("refuses a pagination link that contains the token", async () => {
      await expectRejection(
        listOwnedRepositories(
          settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
          {
            transport: () =>
              jsonResponse(
                200,
                [
                  {
                    path: "settings",
                    visibility: "private",
                    http_url_to_repo:
                      "https://gitlab.example/group/settings.git"
                  }
                ],
                {
                  link:
                    "<https://gitlab.example/api/v4/projects?page=2&token=" +
                    TOKEN +
                    '>; rel="next"'
                }
              )
          }
        ),
        "Refusing to send the token to an unsafe repository API URL."
      );
    });

    it("follows a same-host next page and stops on a repeated page", async () => {
      const seen: string[] = [];
      const listed = await listOwnedRepositories(
        settings("gitlab", "https://gitlab.example/gitlab/api/v4", TOKEN),
        {
          transport: url => {
            seen.push(url.pathname + url.search);
            if (url.search.indexOf("page=2") === -1) {
              return jsonResponse(
                200,
                [
                  {
                    path: "office",
                    visibility: "private",
                    http_url_to_repo: "https://gitlab.example/group/office.git"
                  }
                ],
                {
                  link:
                    '<https://gitlab.example/gitlab/api/v4/projects?owned=true&page=2>; rel="next", <https://gitlab.example/gitlab/api/v4/projects?page=2>; rel="last"'
                }
              );
            }
            return jsonResponse(200, [
              {
                path: "home",
                visibility: "public",
                http_url_to_repo: "https://gitlab.example/group/home.git"
              }
            ]);
          }
        }
      );
      expect(seen).to.deep.equal([
        "/gitlab/api/v4/projects?owned=true&simple=true&per_page=100",
        "/gitlab/api/v4/projects?owned=true&page=2"
      ]);
      expect(listed.map(repository => repository.name)).to.deep.equal([
        "office",
        "home"
      ]);
      expect(listed[0].private).to.equal(true);
      expect(listed[1].private).to.equal(false);

      let repeats = 0;
      await expectRejection(
        listOwnedRepositories(
          settings("github", "https://git.example/api/v3", TOKEN),
          {
            transport: url => {
              repeats++;
              return jsonResponse(
                200,
                [
                  {
                    name: "settings",
                    private: true,
                    clone_url: "https://git.example/me/settings.git"
                  }
                ],
                { link: "<" + url.href + '>; rel="next"' }
              );
            }
          }
        ),
        "The provider repeated a listing page."
      );
      expect(repeats).to.equal(1);
    });

    it("stops after 10 listing pages", async () => {
      let calls = 0;
      await expectRejection(
        listOwnedRepositories(
          settings("github", "https://git.example/api/v3", TOKEN),
          {
            transport: url => {
              calls++;
              expect(url.protocol).to.equal("https:");
              const page = calls + 1;
              return jsonResponse(
                200,
                [
                  {
                    name: "settings",
                    private: true,
                    clone_url: "https://git.example/me/settings.git"
                  }
                ],
                {
                  link:
                    "<https://git.example/api/v3/user/repos?page=" +
                    String(page) +
                    '>; rel="next"'
                }
              );
            }
          }
        ),
        "Provider listing exceeded 10 pages."
      );
      expect(calls).to.equal(10);
    });

    it("hides tokens echoed by a failed response or a thrown client error", async () => {
      await expectRejection(
        createPrivateRepository(
          settings("github", "https://git.example/api/v3", TOKEN),
          "settings",
          {
            transport: () => jsonResponse(401, { message: TOKEN })
          }
        ),
        "Enterprise API request failed (HTTP 401)."
      );
      await expectRejection(
        listOwnedRepositories(
          settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
          {
            transport: () => Promise.reject(new Error("connect " + TOKEN))
          }
        ),
        "The enterprise API request failed."
      );
    });

    it("rejects a clone URL that embeds the token", async () => {
      await expectRejection(
        createPrivateRepository(
          settings("github", "https://git.example/api/v3", TOKEN),
          "settings",
          {
            transport: fixed(201, {
              name: "settings",
              private: true,
              clone_url: "https://git.example/me/" + TOKEN + ".git"
            })
          }
        ),
        "The provider returned a clone URL that contains the token."
      );
    });
  });

  describe("uses the HTTPS client against an enterprise API host", function() {
    this.timeout(15000);

    it("creates and lists a private GitHub Enterprise repository", async () => {
      const server = await listen(certificate, hit => {
        expect(hit.authorization).to.equal("token " + TOKEN);
        expect(hit.privateToken).to.equal("");
        expect(hit.url.indexOf(TOKEN)).to.equal(-1);
        if (hit.method === "POST") {
          expect(hit.url).to.equal("/api/v3/user/repos");
          expect(JSON.parse(hit.body)).to.deep.equal({
            name: "settings",
            private: true,
            auto_init: false
          });
          return json(201, {
            name: "settings",
            private: true,
            clone_url: cloneUrl(server.port, "/me/settings.git")
          });
        }
        expect(hit.method).to.equal("GET");
        expect(hit.url).to.equal(
          "/api/v3/user/repos?per_page=100&affiliation=owner"
        );
        return json(200, [
          {
            name: "settings",
            private: true,
            clone_url: cloneUrl(server.port, "/me/settings.git")
          }
        ]);
      });
      try {
        const api = "https://127.0.0.1:" + String(server.port) + "/api/v3";
        const created = await createPrivateRepository(
          settings("github", api, TOKEN),
          "settings",
          { ca: certificate.cert }
        );
        expect(created).to.deep.equal({
          name: "settings",
          cloneUrl: cloneUrl(server.port, "/me/settings.git"),
          private: true
        });
        const listed = await listOwnedRepositories(
          settings("github", api, TOKEN),
          {
            ca: certificate.cert
          }
        );
        expect(listed).to.deep.equal([created]);
        expect(server.hits).to.have.length(2);
      } finally {
        await server.close();
      }
    });

    it("creates and lists a private GitLab Enterprise repository under a base path", async () => {
      const server = await listen(certificate, hit => {
        expect(hit.privateToken).to.equal(TOKEN);
        expect(hit.authorization).to.equal("");
        expect(hit.url.indexOf(TOKEN)).to.equal(-1);
        if (hit.method === "POST") {
          expect(hit.url).to.equal("/gitlab/api/v4/projects");
          expect(JSON.parse(hit.body).visibility).to.equal("private");
          return json(201, {
            path: "settings",
            visibility: "private",
            http_url_to_repo: cloneUrl(server.port, "/group/settings.git")
          });
        }
        expect(hit.url).to.equal(
          "/gitlab/api/v4/projects?owned=true&simple=true&per_page=100"
        );
        return json(200, [
          {
            path: "settings",
            visibility: "private",
            http_url_to_repo: cloneUrl(server.port, "/group/settings.git")
          }
        ]);
      });
      try {
        const api =
          "https://127.0.0.1:" + String(server.port) + "/gitlab/api/v4";
        const created = await createPrivateRepository(
          settings("gitlab", api, TOKEN),
          "settings",
          { ca: certificate.cert }
        );
        expect(created.cloneUrl).to.equal(
          cloneUrl(server.port, "/group/settings.git")
        );
        const listed = await listOwnedRepositories(
          settings("gitlab", api, TOKEN),
          {
            ca: certificate.cert
          }
        );
        expect(listed[0].name).to.equal("settings");
      } finally {
        await server.close();
      }
    });

    it("does not follow a redirect onto another port with the token", async () => {
      const attacker = await listen(certificate, () => json(200, []));
      const api = await listen(certificate, () => ({
        status: 302,
        headers: {
          Location: "https://127.0.0.1:" + String(attacker.port) + "/steal"
        },
        body: JSON.stringify({ token: TOKEN })
      }));
      try {
        await expectRejection(
          createPrivateRepository(
            settings(
              "github",
              "https://127.0.0.1:" + String(api.port) + "/api/v3",
              TOKEN
            ),
            "settings",
            { ca: certificate.cert }
          ),
          "The enterprise API redirected the request. Refusing to follow it with the token."
        );
        expect(api.hits).to.have.length(1);
        expect(api.hits[0].authorization).to.equal("token " + TOKEN);
        expect(attacker.hits).to.have.length(0);
      } finally {
        await api.close();
        await attacker.close();
      }
    });

    it("does not send the token when a live listing page points at another port", async () => {
      const attacker = await listen(certificate, () =>
        json(200, { stolen: TOKEN })
      );
      const api = await listen(certificate, () =>
        json(
          200,
          [
            {
              name: "settings",
              private: true,
              clone_url:
                "https://127.0.0.1:" + String(api.port) + "/me/settings.git"
            }
          ],
          {
            Link:
              "<https://127.0.0.1:" +
              String(attacker.port) +
              '/api/v3/user/repos?page=2>; rel="next"'
          }
        )
      );
      try {
        await expectRejection(
          listOwnedRepositories(
            settings(
              "github",
              "https://127.0.0.1:" + String(api.port) + "/api/v3",
              TOKEN
            ),
            { ca: certificate.cert }
          ),
          "Refusing to send the token to a different host."
        );
        expect(api.hits).to.have.length(1);
        expect(attacker.hits).to.have.length(0);
      } finally {
        await api.close();
        await attacker.close();
      }
    });

    it("does not send the token when the server certificate is not trusted", async () => {
      const server = await listen(certificate, () => json(201, {}));
      try {
        const error = await rejectionOf(
          createPrivateRepository(
            settings(
              "gitlab",
              "https://127.0.0.1:" + String(server.port) + "/api/v4",
              TOKEN
            ),
            "settings",
            { ca: otherCertificate.cert }
          )
        );
        expect(error.message.indexOf(TOKEN)).to.equal(-1);
        expect(server.hits).to.have.length(0);
      } finally {
        await server.close();
      }
    });

    it("puts and gets settings-sync.json on GitHub Enterprise", async () => {
      const content = '{"uploaded":true}\n';
      let reads = 0;
      const server = await listen(certificate, hit => {
        expect(hit.authorization).to.equal("token " + TOKEN);
        expect(hit.privateToken).to.equal("");
        expect(hit.url.indexOf(TOKEN)).to.equal(-1);
        if (
          hit.method === "GET" &&
          hit.url.indexOf("/contents/settings-sync.json") !== -1
        ) {
          reads++;
          const text = reads === 1 ? "old\n" : content;
          const sha = reads === 1 ? SHA_A : SHA_B;
          expect(hit.url).to.equal(
            "/api/v3/repos/me/settings/contents/settings-sync.json?ref=office"
          );
          return json(200, githubFile(sha, text));
        }
        expect(hit.method).to.equal("PUT");
        expect(hit.url).to.equal(
          "/api/v3/repos/me/settings/contents/settings-sync.json"
        );
        const payload = JSON.parse(hit.body);
        expect(payload.sha).to.equal(SHA_A);
        expect(payload.branch).to.equal("office");
        expect(payload.message).to.equal("Update settings-sync.json");
        expect(
          Buffer.from(payload.content, "base64").toString("utf8")
        ).to.equal(content);
        return json(200, {
          content: {
            name: "settings-sync.json",
            path: "settings-sync.json",
            sha: SHA_B
          }
        });
      });
      try {
        const api = "https://127.0.0.1:" + String(server.port) + "/api/v3";
        const written = await putSettingsFile(
          settings("github", api, TOKEN),
          fileTarget("me/settings", "office"),
          content,
          { ca: certificate.cert }
        );
        expect(written).to.deep.equal({
          content,
          branch: "office",
          sha: SHA_B
        });
        const read = await getSettingsFile(
          settings("github", api, TOKEN),
          fileTarget("me/settings", "office"),
          { ca: certificate.cert }
        );
        expect(read).to.deep.equal({
          content,
          branch: "office",
          sha: SHA_B
        });
        expect(server.hits).to.have.length(3);
      } finally {
        await server.close();
      }
    });

    it("creates a GitLab branch and writes settings-sync.json", async () => {
      const content = '{"office":true}\n';
      let fileReads = 0;
      const server = await listen(certificate, hit => {
        expect(hit.privateToken).to.equal(TOKEN);
        expect(hit.authorization).to.equal("");
        expect(hit.url.indexOf(TOKEN)).to.equal(-1);
        if (
          hit.method === "GET" &&
          hit.url.indexOf("/repository/files/") !== -1
        ) {
          fileReads++;
          if (fileReads > 1) {
            return json(200, gitlabFile(content, "office"));
          }
          return json(404, { message: "404 File Not Found" });
        }
        if (
          hit.method === "GET" &&
          hit.url.indexOf("/repository/branches/") !== -1
        ) {
          expect(hit.url).to.equal(
            "/gitlab/api/v4/projects/group%2Fsettings/repository/branches/office"
          );
          return json(404, { message: "404 Branch Not Found" });
        }
        if (hit.method === "GET") {
          expect(hit.url).to.equal("/gitlab/api/v4/projects/group%2Fsettings");
          return json(200, { default_branch: "main", visibility: "private" });
        }
        if (
          hit.method === "POST" &&
          hit.url.indexOf("/repository/branches") !== -1
        ) {
          expect(JSON.parse(hit.body)).to.deep.equal({
            branch: "office",
            ref: "main"
          });
          return json(201, { name: "office" });
        }
        expect(hit.method).to.equal("POST");
        expect(hit.url).to.equal(
          "/gitlab/api/v4/projects/group%2Fsettings/repository/files/settings-sync.json"
        );
        expect(JSON.parse(hit.body).content).to.equal(content);
        return json(201, {
          file_path: "settings-sync.json",
          branch: "office"
        });
      });
      try {
        const api =
          "https://127.0.0.1:" + String(server.port) + "/gitlab/api/v4";
        const written = await putSettingsFile(
          settings("gitlab", api, TOKEN),
          fileTarget("group/settings", "office"),
          content,
          { ca: certificate.cert }
        );
        expect(written).to.deep.equal({
          content,
          branch: "office",
          sha: SHA_A
        });
        expect(server.hits).to.have.length(6);
      } finally {
        await server.close();
      }
    });

    it("does not follow a settings download redirect onto another port", async () => {
      const attacker = await listen(certificate, () =>
        json(200, { stolen: TOKEN })
      );
      const api = await listen(certificate, () => ({
        status: 302,
        headers: {
          Location: "https://127.0.0.1:" + String(attacker.port) + "/steal"
        },
        body: JSON.stringify({ token: TOKEN })
      }));
      try {
        await expectRejection(
          getSettingsFile(
            settings(
              "github",
              "https://127.0.0.1:" + String(api.port) + "/api/v3",
              TOKEN
            ),
            fileTarget("me/settings", "office"),
            { ca: certificate.cert }
          ),
          "The enterprise API redirected the request. Refusing to follow it with the token."
        );
        expect(api.hits).to.have.length(1);
        expect(api.hits[0].authorization).to.equal("token " + TOKEN);
        expect(attacker.hits).to.have.length(0);
      } finally {
        await api.close();
        await attacker.close();
      }
    });

    it("does not follow a settings upload redirect onto another port", async () => {
      const attacker = await listen(certificate, () =>
        json(200, { stolen: TOKEN })
      );
      const api = await listen(certificate, hit => {
        if (hit.method === "GET") {
          return json(200, gitlabFile("old\n", "office"));
        }
        return {
          status: 307,
          headers: {
            Location: "https://127.0.0.1:" + String(attacker.port) + "/steal"
          },
          body: JSON.stringify({ token: TOKEN })
        };
      });
      try {
        await expectRejection(
          putSettingsFile(
            settings(
              "gitlab",
              "https://127.0.0.1:" + String(api.port) + "/api/v4",
              TOKEN
            ),
            fileTarget("group/settings", "office"),
            FILE_TEXT,
            { ca: certificate.cert }
          ),
          "The enterprise API redirected the request. Refusing to follow it with the token."
        );
        expect(api.hits).to.have.length(2);
        expect(api.hits[0].privateToken).to.equal(TOKEN);
        expect(attacker.hits).to.have.length(0);
      } finally {
        await api.close();
        await attacker.close();
      }
    });

    it("does not send the token for a settings read with an untrusted certificate", async () => {
      const server = await listen(certificate, () =>
        json(200, githubFile(SHA_A, FILE_TEXT))
      );
      try {
        const error = await rejectionOf(
          getSettingsFile(
            settings(
              "github",
              "https://127.0.0.1:" + String(server.port) + "/api/v3",
              TOKEN
            ),
            fileTarget("me/settings", "office"),
            { ca: otherCertificate.cert }
          )
        );
        expect(error.message.indexOf(TOKEN)).to.equal(-1);
        expect(server.hits).to.have.length(0);
      } finally {
        await server.close();
      }
    });
  });

  describe("reads and writes one settings file on the enterprise host", () => {
    it("rejects unsafe repository and branch names before opening a request", async () => {
      const calls: URL[] = [];
      const transport: EnterpriseTransport = url => {
        calls.push(url);
        return Promise.reject(new Error("transport should not be called"));
      };
      const api = settings("github", "https://git.example/api/v3", TOKEN);
      const cases: Array<{
        repository: string;
        branch: string;
        message: string;
      }> = [
        {
          repository: "../settings",
          branch: "office",
          message: "Enter a GitHub repository as owner/name."
        },
        {
          repository: "me/settings/extra",
          branch: "office",
          message: "Enter a GitHub repository as owner/name."
        },
        {
          repository: "me/settings",
          branch: "../office",
          message:
            "Enter a branch name using letters, numbers, dots, underscores, hyphens, or slashes."
        },
        {
          repository: "me/settings",
          branch: "feature//office",
          message:
            "Enter a branch name using letters, numbers, dots, underscores, hyphens, or slashes."
        },
        {
          repository: "me/" + TOKEN,
          branch: "office",
          message: "Refusing to send the token to an unsafe repository API URL."
        }
      ];
      for (let index = 0; index < cases.length; index++) {
        const item = cases[index];
        await expectRejection(
          getSettingsFile(api, fileTarget(item.repository, item.branch), {
            transport
          }),
          item.message
        );
      }
      await expectRejection(
        getSettingsFile(
          settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
          fileTarget("https://attacker.example/group/settings", "office"),
          { transport }
        ),
        "Enter a GitLab project id or group/name."
      );
      await expectRejection(
        getSettingsFile(
          settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
          fileTarget("group/../settings", "office"),
          { transport }
        ),
        "Enter a GitLab project id or group/name."
      );
      await expectRejection(
        putSettingsFile(
          settings("github", "http://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          FILE_TEXT,
          { transport }
        ),
        "The enterprise API URL must be HTTPS without credentials, a query, or a fragment."
      );
      await expectRejection(
        putSettingsFile(
          api,
          fileTarget("me/settings", "office"),
          "x".repeat(512 * 1024 + 1),
          {
            transport
          }
        ),
        "The settings file is too large."
      );
      expect(calls).to.have.length(0);
    });

    it("downloads settings-sync.json from GitHub without leaving the host", async () => {
      const session = serve(() => ({
        statusCode: 200,
        body: {
          type: "file",
          name: "settings-sync.json",
          path: "settings-sync.json",
          encoding: "base64",
          content: wrapBase64(FILE_TEXT),
          sha: SHA_A,
          download_url: "https://attacker.example/settings-sync.json",
          html_url: "https://attacker.example/blob/office/settings-sync.json"
        },
        headers: {
          link: '<https://attacker.example/next>; rel="next"'
        }
      }));
      const file = await getSettingsFile(
        settings("github", "https://git.example/api/v3", TOKEN),
        fileTarget("me/settings", "office"),
        { transport: session.transport }
      );
      expect(file).to.deep.equal({
        content: FILE_TEXT,
        branch: "office",
        sha: SHA_A
      });
      expect(session.calls).to.have.length(1);
      expect(session.calls[0].method).to.equal("GET");
      expect(session.calls[0].href).to.equal(
        "https://git.example/api/v3/repos/me/settings/contents/settings-sync.json?ref=office"
      );
      expect(session.calls[0].authorization).to.equal("token " + TOKEN);
      expect(session.calls[0].privateToken).to.equal("");
      expectHost(session.calls, "https://git.example/");
    });

    it("replaces an existing GitHub file using its blob sha", async () => {
      const session = serve(call => {
        if (call.method === "GET") {
          return { statusCode: 200, body: githubFile(SHA_A, "old\n") };
        }
        expect(JSON.parse(call.body)).to.deep.equal({
          message: "Update settings-sync.json",
          content: Buffer.from(FILE_TEXT, "utf8").toString("base64"),
          branch: "office",
          sha: SHA_A
        });
        return {
          statusCode: 200,
          body: {
            content: {
              name: "settings-sync.json",
              path: "settings-sync.json",
              sha: SHA_B,
              download_url: "https://attacker.example/file"
            },
            commit: {
              sha: SHA_B,
              html_url: "https://attacker.example/commit/" + SHA_B
            }
          }
        };
      });
      const written = await putSettingsFile(
        settings("github", "https://GitHub.Example/api/v3", TOKEN),
        fileTarget("me/settings", "office"),
        FILE_TEXT,
        { transport: session.transport }
      );
      expect(written).to.deep.equal({
        content: FILE_TEXT,
        branch: "office",
        sha: SHA_B
      });
      expect(
        session.calls.map(
          call => call.method + " " + new URL(call.href).pathname
        )
      ).to.deep.equal([
        "GET /api/v3/repos/me/settings/contents/settings-sync.json",
        "PUT /api/v3/repos/me/settings/contents/settings-sync.json"
      ]);
      expect(new URL(session.calls[0].href).search).to.equal("?ref=office");
      expect(new URL(session.calls[1].href).search).to.equal("");
      expect(session.calls[0].authorization).to.equal("token " + TOKEN);
      expectHost(session.calls, "https://github.example/");
    });

    it("creates a missing GitHub branch from the default branch before writing", async () => {
      const seen: string[] = [];
      const session = serve(call => {
        const url = new URL(call.href);
        seen.push(call.method + " " + url.pathname + url.search);
        if (
          url.pathname.indexOf("/contents/settings-sync.json") !== -1 &&
          call.method === "GET"
        ) {
          return { statusCode: 404, body: { message: "Not Found" } };
        }
        if (url.pathname.indexOf("/branches/feature%2Foffice") !== -1) {
          return { statusCode: 404, body: { message: "Branch not found" } };
        }
        if (
          call.method === "GET" &&
          url.pathname.endsWith("/repos/me/settings")
        ) {
          return {
            statusCode: 200,
            body: {
              default_branch: "release/1",
              clone_url: "https://attacker.example/me/settings.git"
            }
          };
        }
        if (url.pathname.indexOf("/git/ref/heads/release%2F1") !== -1) {
          return {
            statusCode: 200,
            body: {
              ref: "refs/heads/release/1",
              object: {
                type: "commit",
                sha: SHA_A,
                url: "https://attacker.example/git/commits/" + SHA_A
              }
            }
          };
        }
        if (call.method === "POST") {
          expect(JSON.parse(call.body)).to.deep.equal({
            ref: "refs/heads/feature/office",
            sha: SHA_A
          });
          return {
            statusCode: 201,
            body: {
              ref: "refs/heads/feature/office",
              object: {
                type: "commit",
                sha: SHA_A,
                url: "https://attacker.example/ref"
              }
            }
          };
        }
        const payload = JSON.parse(call.body);
        expect(payload.sha).to.equal(undefined);
        expect(payload.branch).to.equal("feature/office");
        expect(
          Buffer.from(payload.content, "base64").toString("utf8")
        ).to.equal(FILE_TEXT);
        return {
          statusCode: 201,
          body: {
            content: {
              path: "settings-sync.json",
              name: "settings-sync.json",
              sha: SHA_B
            }
          }
        };
      });
      const written = await putSettingsFile(
        settings("github", "https://git.example/api/v3", TOKEN),
        fileTarget("me/settings", "feature/office"),
        FILE_TEXT,
        { transport: session.transport }
      );
      expect(written).to.deep.equal({
        content: FILE_TEXT,
        branch: "feature/office",
        sha: SHA_B
      });
      expect(seen).to.deep.equal([
        "GET /api/v3/repos/me/settings/contents/settings-sync.json?ref=feature%2Foffice",
        "GET /api/v3/repos/me/settings/branches/feature%2Foffice",
        "GET /api/v3/repos/me/settings",
        "GET /api/v3/repos/me/settings/git/ref/heads/release%2F1",
        "POST /api/v3/repos/me/settings/git/refs",
        "PUT /api/v3/repos/me/settings/contents/settings-sync.json"
      ]);
      expectHost(session.calls, "https://git.example/");
    });

    it("writes a new GitHub file on an existing branch without creating a ref", async () => {
      const seen: string[] = [];
      const session = serve(call => {
        const url = new URL(call.href);
        seen.push(call.method + " " + url.pathname);
        if (
          call.method === "GET" &&
          url.pathname.indexOf("/contents/") !== -1
        ) {
          return { statusCode: 404, body: { message: "Not Found" } };
        }
        if (call.method === "GET") {
          return {
            statusCode: 200,
            body: {
              name: "office",
              commit: {
                sha: SHA_A,
                url: "https://attacker.example/commits/" + SHA_A
              }
            }
          };
        }
        expect(JSON.parse(call.body).sha).to.equal(undefined);
        return {
          statusCode: 201,
          body: { content: { path: "settings-sync.json", sha: SHA_B } }
        };
      });
      const written = await putSettingsFile(
        settings("github", "https://git.example/api/v3", TOKEN),
        fileTarget("me/settings", "office"),
        FILE_TEXT,
        { transport: session.transport }
      );
      expect(written.sha).to.equal(SHA_B);
      expect(seen).to.deep.equal([
        "GET /api/v3/repos/me/settings/contents/settings-sync.json",
        "GET /api/v3/repos/me/settings/branches/office",
        "PUT /api/v3/repos/me/settings/contents/settings-sync.json"
      ]);
      expectHost(session.calls, "https://git.example/");
    });

    it("writes the first GitHub file when the repository has no default branch", async () => {
      const seen: string[] = [];
      const session = serve(call => {
        const url = new URL(call.href);
        seen.push(call.method + " " + url.pathname);
        if (call.method === "PUT") {
          return {
            statusCode: 201,
            body: { content: { path: "settings-sync.json", sha: SHA_B } }
          };
        }
        if (url.pathname.indexOf("/branches/") !== -1) {
          return { statusCode: 404, body: {} };
        }
        if (url.pathname.indexOf("/contents/") !== -1) {
          return { statusCode: 404, body: {} };
        }
        return { statusCode: 200, body: { default_branch: null } };
      });
      await putSettingsFile(
        settings("github", "https://git.example/api/v3", TOKEN),
        fileTarget("me/settings", "office"),
        FILE_TEXT,
        { transport: session.transport }
      );
      expect(seen).to.deep.equal([
        "GET /api/v3/repos/me/settings/contents/settings-sync.json",
        "GET /api/v3/repos/me/settings/branches/office",
        "GET /api/v3/repos/me/settings",
        "PUT /api/v3/repos/me/settings/contents/settings-sync.json"
      ]);
      expectHost(session.calls, "https://git.example/");
    });

    it("downloads settings-sync.json from GitLab Enterprise", async () => {
      const session = serve(call => {
        expect(call.privateToken).to.equal(TOKEN);
        expect(call.authorization).to.equal("");
        return { statusCode: 200, body: gitlabFile(FILE_TEXT, "office") };
      });
      const file = await getSettingsFile(
        settings("gitlab", "https://gitlab.example/gitlab/api/v4", TOKEN),
        fileTarget("42", "office"),
        { transport: session.transport }
      );
      expect(file).to.deep.equal({
        content: FILE_TEXT,
        branch: "office",
        sha: SHA_A
      });
      expect(session.calls[0].href).to.equal(
        "https://gitlab.example/gitlab/api/v4/projects/42/repository/files/settings-sync.json?ref=office"
      );
      expectHost(session.calls, "https://gitlab.example/");
    });

    it("rejects a GitLab file response for a different branch", async () => {
      await expectRejection(
        getSettingsFile(
          settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
          fileTarget("group/settings", "office"),
          {
            transport: () => jsonResponse(200, gitlabFile(FILE_TEXT, "main"))
          }
        ),
        "The provider returned a different branch."
      );
    });

    it("creates a missing GitLab branch from the default branch before writing", async () => {
      const seen: string[] = [];
      let fileReads = 0;
      const session = serve(call => {
        const url = new URL(call.href);
        seen.push(call.method + " " + url.pathname + url.search);
        expect(call.privateToken).to.equal(TOKEN);
        expect(call.href.indexOf(TOKEN)).to.equal(-1);
        if (
          call.method === "GET" &&
          url.pathname.indexOf("/repository/files/") !== -1
        ) {
          fileReads++;
          if (fileReads > 1) {
            return {
              statusCode: 200,
              body: gitlabFile(FILE_TEXT, "feature/office")
            };
          }
          return { statusCode: 404, body: { message: "404" } };
        }
        if (
          call.method === "GET" &&
          url.pathname.indexOf("/repository/branches/") !== -1
        ) {
          return {
            statusCode: 404,
            body: {
              message: "404",
              web_url: "https://attacker.example/branch"
            }
          };
        }
        if (call.method === "GET") {
          return {
            statusCode: 200,
            body: {
              default_branch: "main",
              http_url_to_repo:
                "https://attacker.example/group/team/settings.git"
            }
          };
        }
        if (
          call.method === "POST" &&
          url.pathname.indexOf("/repository/branches") !== -1 &&
          url.pathname.indexOf("/repository/files/") === -1
        ) {
          expect(JSON.parse(call.body)).to.deep.equal({
            branch: "feature/office",
            ref: "main"
          });
          return {
            statusCode: 201,
            body: {
              name: "feature/office",
              web_url: "https://attacker.example/-/tree/feature/office"
            }
          };
        }
        expect(JSON.parse(call.body)).to.deep.equal({
          branch: "feature/office",
          content: FILE_TEXT,
          commit_message: "Update settings-sync.json",
          encoding: "text"
        });
        return {
          statusCode: 201,
          body: {
            file_path: "settings-sync.json",
            branch: "feature/office"
          }
        };
      });
      const written = await putSettingsFile(
        settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
        fileTarget("group/team/settings", "feature/office"),
        FILE_TEXT,
        { transport: session.transport }
      );
      expect(written).to.deep.equal({
        content: FILE_TEXT,
        branch: "feature/office",
        sha: SHA_A
      });
      expect(seen).to.deep.equal([
        "GET /api/v4/projects/group%2Fteam%2Fsettings/repository/files/settings-sync.json?ref=feature%2Foffice",
        "GET /api/v4/projects/group%2Fteam%2Fsettings/repository/branches/feature%2Foffice",
        "GET /api/v4/projects/group%2Fteam%2Fsettings",
        "POST /api/v4/projects/group%2Fteam%2Fsettings/repository/branches",
        "POST /api/v4/projects/group%2Fteam%2Fsettings/repository/files/settings-sync.json",
        "GET /api/v4/projects/group%2Fteam%2Fsettings/repository/files/settings-sync.json?ref=feature%2Foffice"
      ]);
      expectHost(session.calls, "https://gitlab.example/");
    });

    it("updates an existing GitLab file with PUT", async () => {
      const methods: string[] = [];
      let updated = false;
      const session = serve(call => {
        methods.push(call.method);
        expect(call.privateToken).to.equal(TOKEN);
        if (call.method === "GET") {
          return {
            statusCode: 200,
            body: gitlabFile(updated ? FILE_TEXT : "old\n", "office")
          };
        }
        expect(JSON.parse(call.body).content).to.equal(FILE_TEXT);
        expect(JSON.parse(call.body).last_commit_id).to.equal(SHA_C);
        updated = true;
        return {
          statusCode: 200,
          body: { file_path: "settings-sync.json", branch: "office" }
        };
      });
      const written = await putSettingsFile(
        settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
        fileTarget("group/settings", "office"),
        FILE_TEXT,
        { transport: session.transport }
      );
      expect(methods).to.deep.equal(["GET", "PUT", "GET"]);
      expect(written.sha).to.equal(SHA_A);
      expect(session.calls[1].href).to.equal(
        "https://gitlab.example/api/v4/projects/group%2Fsettings/repository/files/settings-sync.json"
      );
      expectHost(session.calls, "https://gitlab.example/");
    });

    it("does not report another writer's GitLab content as our upload", async () => {
      const session = serve(call =>
        call.method === "GET"
          ? { statusCode: 200, body: gitlabFile("other\n", "office") }
          : {
              statusCode: 200,
              body: { file_path: "settings-sync.json", branch: "office" }
            }
      );
      await expectRejection(
        putSettingsFile(
          settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
          fileTarget("group/settings", "office"),
          FILE_TEXT,
          { transport: session.transport }
        ),
        "Remote settings changed after upload; refresh before retrying."
      );
      expect(session.calls.map(call => call.method)).to.deep.equal([
        "GET", "PUT", "GET"
      ]);
    });

    it("rejects a GitLab update without a trustworthy last commit", async () => {
      const file = gitlabFile("old\n", "office");
      delete file.last_commit_id;
      const session = serve(() => ({ statusCode: 200, body: file }));
      await expectRejection(
        putSettingsFile(
          settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
          fileTarget("group/settings", "office"),
          FILE_TEXT,
          { transport: session.transport }
        ),
        "The provider did not return a file last_commit_id."
      );
      expect(session.calls.map(call => call.method)).to.deep.equal(["GET"]);
    });

    it("does not create a branch when settings-sync.json is missing", async () => {
      const session = serve(() => ({
        statusCode: 404,
        body: { message: "Not Found" }
      }));
      await expectRejection(
        getSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          { transport: session.transport }
        ),
        "settings-sync.json was not found on that branch."
      );
      expect(session.calls).to.have.length(1);
    });

    it("does not fetch a cross-origin download URL when the body is omitted", async () => {
      const session = serve(() => ({
        statusCode: 200,
        body: {
          type: "file",
          path: "settings-sync.json",
          name: "settings-sync.json",
          encoding: "none",
          size: 12,
          sha: SHA_A,
          download_url:
            "https://attacker.example/settings-sync.json?token=" + TOKEN
        }
      }));
      await expectRejection(
        getSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          { transport: session.transport }
        ),
        "The provider did not return the settings file inline."
      );
      expect(session.calls).to.have.length(1);
      expectHost(session.calls, "https://git.example/");
    });

    it("does not follow a redirect of a settings read or write", async () => {
      const read = serve(() => ({
        statusCode: 302,
        body: { token: TOKEN },
        headers: { location: "https://attacker.example/steal" }
      }));
      await expectRejection(
        getSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          { transport: read.transport }
        ),
        "The enterprise API redirected the request. Refusing to follow it with the token."
      );
      expect(read.calls).to.have.length(1);

      const update = serve(call => {
        if (call.method === "GET") {
          return { statusCode: 200, body: gitlabFile("old\n", "office") };
        }
        return {
          statusCode: 307,
          body: { token: TOKEN },
          headers: { location: "https://attacker.example/steal" }
        };
      });
      await expectRejection(
        putSettingsFile(
          settings("gitlab", "https://gitlab.example/api/v4", TOKEN),
          fileTarget("group/settings", "office"),
          FILE_TEXT,
          { transport: update.transport }
        ),
        "The enterprise API redirected the request. Refusing to follow it with the token."
      );
      expect(update.calls).to.have.length(2);
      expectHost(update.calls, "https://gitlab.example/");
    });

    it("stops when branch lookup is redirected", async () => {
      const session = serve(call => {
        const url = new URL(call.href);
        if (url.pathname.indexOf("/contents/") !== -1) {
          return { statusCode: 404, body: {} };
        }
        if (url.pathname.indexOf("/branches/") !== -1) {
          return { statusCode: 404, body: {} };
        }
        return {
          statusCode: 301,
          body: { token: TOKEN },
          headers: { location: "https://attacker.example/repos/me/settings" }
        };
      });
      await expectRejection(
        putSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          FILE_TEXT,
          { transport: session.transport }
        ),
        "The enterprise API redirected the request. Refusing to follow it with the token."
      );
      expect(session.calls).to.have.length(3);
      expectHost(session.calls, "https://git.example/");
    });

    it("does not request a default branch that is a URL", async () => {
      const session = serve(call => {
        const url = new URL(call.href);
        if (url.pathname.indexOf("/contents/") !== -1) {
          return { statusCode: 404, body: {} };
        }
        if (url.pathname.indexOf("/branches/") !== -1) {
          return { statusCode: 404, body: {} };
        }
        return {
          statusCode: 200,
          body: { default_branch: "https://attacker.example/main" }
        };
      });
      await expectRejection(
        putSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          FILE_TEXT,
          { transport: session.transport }
        ),
        "The provider returned an unexpected default branch."
      );
      expect(session.calls).to.have.length(3);
      expectHost(session.calls, "https://git.example/");
    });

    it("rejects a file response that is not settings-sync.json", async () => {
      await expectRejection(
        getSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          {
            transport: () =>
              jsonResponse(200, {
                type: "file",
                path: "README.md",
                encoding: "base64",
                content: wrapBase64("nope"),
                sha: SHA_A,
                download_url: "https://attacker.example/README.md"
              })
          }
        ),
        "The provider did not return settings-sync.json."
      );
    });

    it("retries a stale GitHub upload once with the fresh blob sha", async () => {
      const shas: string[] = [];
      let reads = 0;
      const session = serve(call => {
        expect(new URL(call.href).hostname).to.equal("git.example");
        if (call.method === "GET") {
          reads++;
          const body = githubFile(reads === 1 ? SHA_A : SHA_B, "old\n");
          body.download_url =
            "https://attacker.example/settings-sync.json?token=" + TOKEN;
          return { statusCode: 200, body };
        }
        const payload = JSON.parse(call.body);
        shas.push(payload.sha);
        if (shas.length === 1) {
          return { statusCode: 409, body: { message: TOKEN } };
        }
        return {
          statusCode: 200,
          body: {
            content: {
              path: "settings-sync.json",
              sha: SHA_C,
              download_url: "https://attacker.example/file"
            }
          }
        };
      });
      const written = await putSettingsFile(
        settings("github", "https://git.example/api/v3", TOKEN),
        fileTarget("me/settings", "office"),
        FILE_TEXT,
        { transport: session.transport }
      );
      expect(written).to.deep.equal({
        content: FILE_TEXT,
        branch: "office",
        sha: SHA_C
      });
      expect(shas).to.deep.equal([SHA_A, SHA_B]);
      expect(
        session.calls.map(
          call => call.method + " " + new URL(call.href).pathname
        )
      ).to.deep.equal([
        "GET /api/v3/repos/me/settings/contents/settings-sync.json",
        "PUT /api/v3/repos/me/settings/contents/settings-sync.json",
        "GET /api/v3/repos/me/settings/contents/settings-sync.json",
        "PUT /api/v3/repos/me/settings/contents/settings-sync.json"
      ]);
      expectHost(session.calls, "https://git.example/");
    });

    it("does not overwrite another writer's GitHub settings after a 409", async () => {
      let reads = 0;
      let writes = 0;
      const session = serve(call => {
        if (call.method === "GET") {
          reads++;
          return {
            statusCode: 200,
            body: githubFile(
              reads === 1 ? SHA_A : SHA_B,
              reads === 1 ? "old\n" : "teammate edit\n"
            )
          };
        }
        writes++;
        return { statusCode: 409, body: { message: "stale" } };
      });
      await expectRejection(
        putSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          FILE_TEXT,
          { transport: session.transport }
        ),
        "Remote settings changed during upload; refresh before overwriting."
      );
      expect(writes).to.equal(1);
      expect(session.calls.map(call => call.method)).to.deep.equal([
        "GET", "PUT", "GET"
      ]);
    });

    it("recognizes a concurrently stored identical GitHub settings file", async () => {
      let reads = 0;
      const session = serve(call => {
        if (call.method === "GET") {
          reads++;
          return {
            statusCode: 200,
            body: githubFile(
              reads === 1 ? SHA_A : SHA_B,
              reads === 1 ? "old\n" : FILE_TEXT
            )
          };
        }
        return { statusCode: 409, body: { message: "stale" } };
      });
      const written = await putSettingsFile(
        settings("github", "https://git.example/api/v3", TOKEN),
        fileTarget("me/settings", "office"),
        FILE_TEXT,
        { transport: session.transport }
      );
      expect(written).to.deep.equal({
        content: FILE_TEXT, branch: "office", sha: SHA_B
      });
      expect(session.calls.map(call => call.method)).to.deep.equal([
        "GET", "PUT", "GET"
      ]);
    });

    it("stops after a second stale GitHub upload", async () => {
      const shas: string[] = [];
      let reads = 0;
      const session = serve(call => {
        if (call.method === "GET") {
          reads++;
          return {
            statusCode: 200,
            body: githubFile(reads === 1 ? SHA_A : SHA_B, "old\n")
          };
        }
        shas.push(JSON.parse(call.body).sha);
        return { statusCode: 409, body: { message: TOKEN } };
      });
      await expectRejection(
        putSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          FILE_TEXT,
          { transport: session.transport }
        ),
        "Enterprise API request failed (HTTP 409)."
      );
      expect(shas).to.deep.equal([SHA_A, SHA_B]);
      expect(session.calls.map(call => call.method)).to.deep.equal([
        "GET",
        "PUT",
        "GET",
        "PUT"
      ]);
      expectHost(session.calls, "https://git.example/");
    });

    it("does not retry a GitHub upload when the fresh read is redirected", async () => {
      let puts = 0;
      let reads = 0;
      const session = serve(call => {
        if (call.method === "PUT") {
          puts++;
          return { statusCode: 409, body: { message: "conflict" } };
        }
        reads++;
        if (reads === 1) {
          return { statusCode: 200, body: githubFile(SHA_A, "old\n") };
        }
        return {
          statusCode: 302,
          body: { token: TOKEN },
          headers: { location: "https://attacker.example/steal" }
        };
      });
      await expectRejection(
        putSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          FILE_TEXT,
          { transport: session.transport }
        ),
        "The enterprise API redirected the request. Refusing to follow it with the token."
      );
      expect(puts).to.equal(1);
      expect(session.calls).to.have.length(3);
      expectHost(session.calls, "https://git.example/");
    });

    it("hides a token echoed by a failed settings upload", async () => {
      const session = serve(call => {
        if (call.method === "GET") {
          return { statusCode: 200, body: githubFile(SHA_A, "old\n") };
        }
        return { statusCode: 409, body: { message: TOKEN } };
      });
      await expectRejection(
        putSettingsFile(
          settings("github", "https://git.example/api/v3", TOKEN),
          fileTarget("me/settings", "office"),
          FILE_TEXT,
          { transport: session.transport }
        ),
        "Enterprise API request failed (HTTP 409)."
      );
      expect(session.calls.map(call => call.method)).to.deep.equal([
        "GET",
        "PUT",
        "GET",
        "PUT"
      ]);
    });
  });
});

function settings(
  provider: string,
  apiUrl: string,
  token: string = TOKEN
): EnterpriseApiSettings {
  return { provider, apiUrl, token };
}

function fileTarget(
  repository: string,
  branch: string
): EnterpriseSettingsTarget {
  return { repository, branch };
}

interface RecordedCall {
  href: string;
  method: string;
  authorization: string;
  privateToken: string;
  body: string;
}

function serve(
  respond: (
    call: RecordedCall
  ) => {
    statusCode: number;
    body: unknown;
    headers?: { [name: string]: string };
  }
): { transport: EnterpriseTransport; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const transport: EnterpriseTransport = (url, method, headers, body) => {
    const call: RecordedCall = {
      href: url.href,
      method,
      authorization: headers.Authorization || "",
      privateToken: headers["PRIVATE-TOKEN"] || "",
      body: body || ""
    };
    calls.push(call);
    const result = respond(call);
    return jsonResponse(result.statusCode, result.body, result.headers);
  };
  return { transport, calls };
}

function expectHost(calls: RecordedCall[], origin: string): void {
  calls.forEach(call => {
    expect(call.href.indexOf(TOKEN)).to.equal(-1);
    expect(call.href.indexOf(origin)).to.equal(0);
  });
}

function wrapBase64(text: string): string {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  const lines: string[] = [];
  for (let index = 0; index < encoded.length; index += 60) {
    lines.push(encoded.substring(index, index + 60));
  }
  return lines.join("\n") + "\n";
}

function githubFile(sha: string, text: string): { [key: string]: unknown } {
  return {
    type: "file",
    name: "settings-sync.json",
    path: "settings-sync.json",
    encoding: "base64",
    content: Buffer.from(text, "utf8").toString("base64"),
    sha
  };
}

function gitlabFile(text: string, ref: string): { [key: string]: unknown } {
  return {
    file_name: "settings-sync.json",
    file_path: "settings-sync.json",
    encoding: "base64",
    content: Buffer.from(text, "utf8").toString("base64"),
    blob_id: SHA_A,
    last_commit_id: SHA_C,
    ref,
    size: Buffer.byteLength(text)
  };
}

function fixed(
  statusCode: number,
  body: { [key: string]: unknown }
): EnterpriseTransport {
  return () => jsonResponse(statusCode, body);
}

function jsonResponse(
  statusCode: number,
  body: unknown,
  headers?: { [name: string]: string }
): Promise<EnterpriseResponse> {
  return Promise.resolve({
    statusCode,
    headers: headers || {},
    body: JSON.stringify(body)
  });
}

async function expectRejection(
  promise: Promise<unknown>,
  message: string
): Promise<void> {
  const error = await rejectionOf(promise);
  expect(error.message).to.equal(message);
  expect(error.message.indexOf(TOKEN)).to.equal(-1);
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected the enterprise API call to fail.");
}

interface CertificatePair {
  cert: Buffer;
  key: Buffer;
}

function createCertificate(directory: string, name: string): CertificatePair {
  const key = path.join(directory, name + ".key");
  const cert = path.join(directory, name + ".crt");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-nodes",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost"
    ],
    { stdio: "pipe" }
  );
  return {
    cert: fs.readFileSync(cert),
    key: fs.readFileSync(key)
  };
}

interface Hit {
  method: string;
  url: string;
  authorization: string;
  privateToken: string;
  body: string;
}

interface LiveServer {
  port: number;
  hits: Hit[];
  close: () => Promise<void>;
}

function json(
  status: number,
  body: unknown,
  headers?: { [name: string]: string }
): { status: number; headers: { [name: string]: string }; body: string } {
  return {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, headers),
    body: JSON.stringify(body)
  };
}

function cloneUrl(port: number, repositoryPath: string): string {
  return "https://127.0.0.1:" + String(port) + repositoryPath;
}

function listen(
  certificate: CertificatePair,
  handler: (
    hit: Hit
  ) => { status: number; headers?: { [name: string]: string }; body: string }
): Promise<LiveServer> {
  const hits: Hit[] = [];
  const server = https.createServer(
    { cert: certificate.cert, key: certificate.key },
    (request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        const hit: Hit = {
          method: request.method || "",
          url: request.url || "",
          authorization: String(request.headers.authorization || ""),
          privateToken: String(request.headers["private-token"] || ""),
          body: Buffer.concat(chunks).toString("utf8")
        };
        hits.push(hit);
        const result = handler(hit);
        response.writeHead(result.status, result.headers || {});
        response.end(result.body);
      });
    }
  );
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not bind to a port.");
      }
      resolve({
        port: address.port,
        hits,
        close: () =>
          new Promise(done => {
            server.close(() => done());
          })
      });
    });
  });
}
