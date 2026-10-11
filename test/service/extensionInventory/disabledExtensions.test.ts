"use strict";
// Requirement-focused tests for issue #143 (disabled-extension sync).
// Each test maps to an acceptance criterion; generic suite green alone
// must never count as feature evidence (see WorkForge quality gate).
import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  listDiskExtensionEntries,
  parseExtensionFolderName
} from "../../../src/service/extensionInventory.service";
import {
  ExtensionInformation,
  PluginService
} from "../../../src/service/plugin.service";

function makeApiExt(publisher: string, name: string) {
  return {
    id: `${publisher}.${name}`,
    packageJSON: {
      name,
      publisher,
      version: "1.0.0",
      isBuiltin: false,
      __metadata: {}
    }
  };
}

function makeDiskExt(folder: string, publisher: string, name: string) {
  const dir = path.join(folder, `${publisher}.${name}-2.0.0`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name, publisher, version: "2.0.0" })
  );
}

describe("Issue #143 acceptance", () => {
  let folder: string;
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "extinv-"));
    (vscode.extensions as any).all = [makeApiExt("pub-a", "enabled-ext")];
    (vscode.commands as any).__calls = [];
    (vscode.commands as any).__executeCommandImpl = null;
  });

  it("R1 parses on-disk <publisher>.<name>-<version> folders", () => {
    expect(parseExtensionFolderName("pub-a.my-ext-2.0.0")).to.deep.equal({
      publisher: "pub-a",
      name: "my-ext",
      version: "2.0.0"
    });
    expect(
      parseExtensionFolderName("dotted.pub.multi.part-1.2.3")
    ).to.deep.equal({
      publisher: "dotted",
      name: "pub.multi.part",
      version: "1.2.3"
    });
    expect(parseExtensionFolderName("no-version")).to.equal(null);
    expect(parseExtensionFolderName(".obsolete")).to.equal(null);
    expect(parseExtensionFolderName("-1.0.0")).to.equal(null);
  });

  it("R2 upload inventory includes API-invisible disk extensions as disabled", () => {
    makeDiskExt(folder, "pub-a", "enabled-ext");
    makeDiskExt(folder, "pub-b", "disabled-ext");
    const list = PluginService.CreateExtensionListWithDisabled(folder);
    const names = list.map(e => `${e.publisher}.${e.name}`);
    expect(names).to.include("pub-a.enabled-ext");
    expect(names).to.include("pub-b.disabled-ext");
    const disabled = list.find(e => e.name === "disabled-ext");
    const enabled = list.find(e => e.name === "enabled-ext");
    expect(disabled.disabled).to.equal(true);
    expect(enabled.disabled).to.equal(false);
  });

  it("R3 no duplicates when disk and API overlap; enabled untouched", () => {
    makeDiskExt(folder, "pub-a", "enabled-ext");
    const list = PluginService.CreateExtensionListWithDisabled(folder);
    expect(list.filter(e => e.name === "enabled-ext")).to.have.length(1);
    expect(
      list.every(e => e.disabled === false || e.name !== "enabled-ext")
    ).to.equal(true);
  });

  it("R4 obsolete entries and builtins are never resurrected", () => {
    makeDiskExt(folder, "pub-c", "gone-ext");
    fs.writeFileSync(
      path.join(folder, ".obsolete"),
      JSON.stringify({ "pub-c.gone-ext-2.0.0": true })
    );
    const builtin = path.join(folder, "pub-d.builtin-ext-1.0.0");
    fs.mkdirSync(builtin, { recursive: true });
    fs.writeFileSync(
      path.join(builtin, "package.json"),
      JSON.stringify({
        name: "builtin-ext",
        publisher: "pub-d",
        version: "1.0.0",
        isBuiltin: true
      })
    );
    const entries = listDiskExtensionEntries(folder);
    expect(entries.map(e => e.name)).to.not.include("gone-ext");
    expect(entries.map(e => e.name)).to.not.include("builtin-ext");
  });

  it("R5 disabled flag survives cloud serialization round-trip", () => {
    makeDiskExt(folder, "pub-b", "disabled-ext");
    const list = PluginService.CreateExtensionListWithDisabled(folder);
    const restored = ExtensionInformation.fromJSONList(JSON.stringify(list));
    const disabled = restored.find(e => e.name === "disabled-ext");
    const enabled = restored.find(e => e.name === "enabled-ext");
    expect(disabled.disabled).to.equal(true);
    expect(enabled.disabled).to.equal(false);
  });

  it("R6 old cloud payloads without the flag parse as enabled", () => {
    const legacy = JSON.stringify([
      {
        metadata: {},
        name: "legacy-ext",
        publisher: "pub-l",
        version: "1.0.0"
      }
    ]);
    const restored = ExtensionInformation.fromJSONList(legacy);
    expect(restored[0].disabled).to.equal(false);
  });

  it("R7 download re-disables flagged extensions and skips enabled ones", async () => {
    const remote = ExtensionInformation.fromJSONList(
      JSON.stringify([
        {
          metadata: {},
          name: "off-ext",
          publisher: "pub-b",
          version: "2.0.0",
          disabled: true
        },
        {
          metadata: {},
          name: "on-ext",
          publisher: "pub-a",
          version: "1.0.0",
          disabled: false
        }
      ])
    );
    const notes: string[] = [];
    const result = await PluginService.DisableExtensions(remote, (m: string) =>
      notes.push(m)
    );
    const calls = (vscode.commands as any).__calls;
    expect(calls).to.have.length(1);
    expect(calls[0].command).to.equal("workbench.extensions.disableExtension");
    expect(calls[0].args).to.deep.equal(["pub-b.off-ext"]);
    expect(result.disabled).to.deep.equal(["pub-b.off-ext"]);
    expect(result.skipped).to.deep.equal([]);
    expect(notes.join(" ")).to.contain("pub-b.off-ext");
  });

  it("R8 clients without the disable command degrade to skipped, not failed sync", async () => {
    (vscode.commands as any).__executeCommandImpl = () =>
      Promise.reject(new Error("command not found"));
    const remote = ExtensionInformation.fromJSONList(
      JSON.stringify([
        {
          metadata: {},
          name: "off-ext",
          publisher: "pub-b",
          version: "2.0.0",
          disabled: true
        }
      ])
    );
    const result = await PluginService.DisableExtensions(
      remote,
      () => undefined
    );
    expect(result.disabled).to.deep.equal([]);
    expect(result.skipped).to.deep.equal(["pub-b.off-ext"]);
  });
});
