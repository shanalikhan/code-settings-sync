import { expect } from "chai";
import { RepositorySyncConfig } from "../../../src/models/repositorySyncConfig.model";
import { repositorySettingsFromMessage } from "../../../src/service/git/repositorySettings";
import { GitRepositorySyncService } from "../../../src/service/git/repositorySync.service";

function settings(): RepositorySyncConfig {
  return Object.assign(new RepositorySyncConfig(), {
    mode: "repository",
    remoteUrl: "git@git.example:owner/settings.git",
    branch: "office"
  });
}

describe("repository settings messages", () => {
  it("returns a fresh typed snapshot and keeps the selected branch", () => {
    const input = settings();
    const result = repositorySettingsFromMessage(input, false);
    expect(result).to.be.instanceOf(RepositorySyncConfig);
    expect(result).not.to.equal(input);
    expect(result.remoteUrl).to.equal(input.remoteUrl);
    expect(result.branch).to.equal("office");
    result.branch = "home";
    expect(input.branch).to.equal("office");
  });

  it("can switch to Gist with incomplete repository configuration", () => {
    const input = Object.assign(settings(), {
      mode: "gist",
      provider: "gitlab",
      apiUrl: "",
      token: "",
      repository: "",
      remoteUrl: "",
      branch: ""
    });
    expect(repositorySettingsFromMessage(input, false).mode).to.equal("gist");
  });

  it("uses existing HTTPS, SSH and local remotes without API credentials", () => {
    const remotes = [
      "https://git.example/owner/settings.git",
      "ssh://git@git.example/owner/settings.git",
      "git@git.example:owner/settings.git",
      "/tmp/settings repo.git",
      "../settings.git",
      "C:\\settings repo.git"
    ];
    remotes.forEach(remoteUrl => {
      const input = Object.assign(settings(), {
        remoteUrl,
        apiUrl: "",
        token: ""
      });
      expect(repositorySettingsFromMessage(input, false).remoteUrl).to.equal(
        remoteUrl
      );
    });
  });

  it("rejects malformed snapshots and non-string field values without coercion", () => {
    [
      null,
      [],
      "repository",
      {},
      Object.assign(settings(), { branch: 5 }),
      Object.assign(settings(), { token: false }),
      Object.assign(settings(), { remoteUrl: {} })
    ].forEach(input => {
      expect(() => repositorySettingsFromMessage(input, false)).to.throw();
    });
  });

  it("rejects unknown storage and provider choices even when switching to Gist", () => {
    expect(() =>
      repositorySettingsFromMessage(
        Object.assign(settings(), { mode: "repo" }),
        false
      )
    ).to.throw("Select Gist or Git repository");
    expect(() =>
      repositorySettingsFromMessage(
        Object.assign(settings(), { mode: "gist", provider: "other" }),
        false
      )
    ).to.throw("Select GitHub or GitLab");
  });

  it("rejects unsupported remotes and embedded HTTPS credentials", () => {
    [
      "",
      "http://git.example/repo",
      "git://git.example/repo",
      "https://user:secret@git.example/repo",
      "https://token@git.example/repo",
      "ssh://git:secret@git.example/repo",
      "-remote",
      "repo\nname",
      "ftp://git.example/repo",
      "ext::invalid"
    ].forEach(remoteUrl => {
      expect(() =>
        repositorySettingsFromMessage(
          Object.assign(settings(), { remoteUrl }),
          false
        )
      ).to.throw("Enter an HTTPS, SSH or local Git repository remote");
    });
  });

  it("rejects invalid Git branch names before saving", () => {
    [
      "",
      "HEAD",
      "-office",
      "work space",
      "work..office",
      "work@{1}",
      "work/",
      "/work",
      "work//office",
      ".work",
      "work/.hidden",
      "work.lock",
      "work.",
      "work~1",
      "work:office",
      "work?",
      "work*",
      "work[",
      "work\\office",
      "work\n"
    ].forEach(branch => {
      expect(() =>
        repositorySettingsFromMessage(
          Object.assign(settings(), { branch }),
          false
        )
      ).to.throw("Enter a valid Git branch/profile");
    });
  });

  it("preserves nested profiles and trims surrounding ordinary spaces", () => {
    const input = Object.assign(settings(), {
      branch: " teams/office ",
      remoteUrl: " /tmp/settings repo.git "
    });
    const result = repositorySettingsFromMessage(input, false);
    expect(result.branch).to.equal("teams/office");
    expect(result.remoteUrl).to.equal("/tmp/settings repo.git");
  });

  it("validates creation settings without requiring an existing remote", () => {
    ["github", "gitlab"].forEach(provider => {
      const input = Object.assign(settings(), {
        provider,
        apiUrl: "https://git.example/api",
        token: "example-token",
        repository: "settings-profile",
        remoteUrl: ""
      });
      const result = repositorySettingsFromMessage(input, true);
      expect(result.repository).to.equal("settings-profile");
      expect(result.provider).to.equal(provider);
      expect(result.token).to.equal("example-token");
    });
  });

  it("requires valid creation fields even if Gist is currently selected", () => {
    expect(() =>
      repositorySettingsFromMessage(new RepositorySyncConfig(), true)
    ).to.throw("Enter an API credential");
  });

  it("refuses an insecure or credential-bearing API root for creation", () => {
    [
      "http://git.example/api",
      "https://user:secret@git.example/api",
      "https://git.example/api?token=secret",
      "https://git.example/api#section",
      "not a URL",
      "https://git.example/api\n"
    ].forEach(apiUrl => {
      const input = Object.assign(settings(), {
        apiUrl,
        token: "example-token",
        repository: "settings"
      });
      expect(() => repositorySettingsFromMessage(input, true)).to.throw(
        "Enter an HTTPS API URL"
      );
    });
  });

  it("rejects empty, whitespace-containing and oversized creation credentials", () => {
    ["", "two words", "token\n", "x".repeat(4097)].forEach(token => {
      const input = Object.assign(settings(), {
        token,
        repository: "settings"
      });
      expect(() => repositorySettingsFromMessage(input, true)).to.throw(
        "Enter an API credential"
      );
    });
  });

  it("requires a simple creation name instead of an owner/name target", () => {
    ["", "owner/settings", "settings repo", "../settings"].forEach(
      repository => {
        const input = Object.assign(settings(), {
          repository,
          token: "example-token"
        });
        expect(() => repositorySettingsFromMessage(input, true)).to.throw(
          "Enter a new repository name"
        );
      }
    );
  });

  it("enforces saved branch grammar on loaded runtime configuration", async () => {
    const rejected = [
      "HEAD",
      "@",
      "-unsafe",
      "work space",
      "work..office",
      "work@{1}",
      "work.lock",
      "work/",
      ".work",
    ];
    for (const branch of rejected) {
      const state: any = {
        commons: {
          GetCustomSettings: async () => ({
            repositorySync: {
              mode: "repository",
              remoteUrl: "../settings.git",
              branch,
            },
          }),
        },
      };
      expect(await new GitRepositorySyncService(state).IsConfigured()).to.equal(false);
    }

    const state: any = {
      commons: {
        GetCustomSettings: async () => ({
          repositorySync: {
            mode: "repository",
            remoteUrl: "../settings.git",
            branch: "teams/office",
          },
        }),
      },
    };
    expect(await new GitRepositorySyncService(state).IsConfigured()).to.equal(true);
  });

  it("enforces the settings remote allowlist on loaded runtime configuration", async () => {
    const rejected = [
      "ext::unapproved-helper",
      "ftp://git.example/settings.git",
      "file:///tmp/settings.git",
      "-unsafe-remote",
      "https://user:secret@git.example/repo",
    ];
    for (const remoteUrl of rejected) {
      const state: any = {
        commons: {
          GetCustomSettings: async () => ({
            repositorySync: { mode: "repository", remoteUrl, branch: "office" },
          }),
        },
      };
      expect(await new GitRepositorySyncService(state).IsConfigured()).to.equal(false);
    }
  });

  it("retains HTTPS, SSH and local Git remotes at the runtime boundary", async () => {
    const allowed = [
      "https://git.example/owner/settings.git",
      "ssh://git@git.example/owner/settings.git",
      "git@git.example:owner/settings.git",
      "../settings.git",
    ];
    for (const remoteUrl of allowed) {
      const state: any = {
        commons: {
          GetCustomSettings: async () => ({
            repositorySync: { mode: "repository", remoteUrl, branch: "office" },
          }),
        },
      };
      expect(await new GitRepositorySyncService(state).IsConfigured()).to.equal(true);
    }
  });
});
