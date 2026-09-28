import * as assert from "assert";
import { parse, parseTree, ParseError } from "jsonc-parser";
import { ExtensionConfig } from "../src/models/extensionConfig.model";
import { preserveLocalSyncSettings } from "../src/service/syncSettings";

describe("Local sync options in imported settings", () => {
  const local = new ExtensionConfig();
  local.gist = "local-profile";
  local.quietSync = false;
  local.syncExtensions = false;
  local.removeExtensions = false;
  local.forceDownload = true;
  local.forceUpload = true;
  local.sortAlphabetically = true;

  it("retains all nine local options while importing unrelated preferences", () => {
    const remote = new ExtensionConfig();
    const data = { "editor.fontSize": 19 };
    for (const key of Object.keys(remote)) {
      data["sync." + key] =
        typeof local[key] === "boolean" ? !local[key] : "remote";
    }
    const result = parse(
      preserveLocalSyncSettings(JSON.stringify(data), local)
    );
    for (const key of Object.keys(local)) {
      assert.strictEqual(result["sync." + key], local[key], key);
    }
    assert.strictEqual(result["editor.fontSize"], 19);
  });

  it("retains comments, pragma markers, trailing commas and unowned sync keys", () => {
    const content = `{
  // @sync os=linux
  "editor.fontSize": 19,
  /* keep this comment */ "sync.gist": "remote",
  "sync.token": "unchanged-imported-value",
  "sync.customOption": "unowned",
  "unrelated": "text mentioning sync.gist and https://example.test",
}`;
    const result = preserveLocalSyncSettings(content, local);
    assert.ok(result.includes("// @sync os=linux"));
    assert.ok(result.includes("/* keep this comment */"));
    const errors: ParseError[] = [];
    const data = parse(result, errors, { allowTrailingComma: true });
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(data["sync.gist"], "local-profile");
    assert.strictEqual(data["sync.token"], "unchanged-imported-value");
    assert.strictEqual(data["sync.customOption"], "unowned");
    assert.strictEqual(
      data.unrelated,
      "text mentioning sync.gist and https://example.test"
    );
  });

  it("replaces every duplicate flat and nested local option without removing other keys", () => {
    const result = preserveLocalSyncSettings(
      `{
      "sync.gist": "first", "sync.gist": "last",
      "sync": {"gist": "nested-first", "quietSync": true, "custom": 7},
      "sync": {"gist": "nested-last", "quietSync": true, "quietSync": true}
    }`,
      local
    );
    const root = parseTree(result);
    for (const property of root.children) {
      if (property.children[0].value === "sync.gist") {
        assert.strictEqual(property.children[1].value, "local-profile");
      }
      if (property.children[0].value === "sync") {
        for (const nested of property.children[1].children) {
          if (nested.children[0].value === "gist") {
            assert.strictEqual(nested.children[1].value, "local-profile");
          } else if (nested.children[0].value === "quietSync") {
            assert.strictEqual(nested.children[1].value, false);
          } else if (nested.children[0].value === "custom") {
            assert.strictEqual(nested.children[1].value, 7);
          }
        }
      }
    }
  });

  it("preserves effective keys after later partial or empty duplicate sync sections", () => {
    for (const content of [
      '{"sync":{"gist":"first"},"sync":{}}',
      '{"sync":{"gist":"first"},"sync":{"quietSync":true}}',
      '{"sync.gist":"first","sync":{},"sync.quietSync":true}',
      '{"sync":{},"sync.gist":"last"}'
    ]) {
      const data = parse(preserveLocalSyncSettings(content, local));
      for (const key of Object.keys(local)) {
        assert.strictEqual(data["sync." + key], local[key], key);
        assert.strictEqual(data.sync[key], local[key], key);
      }
    }
  });

  it("adds absent local options to empty or comment-only settings", () => {
    for (const content of ["", "{}", "// preserved comment\n"]) {
      const result = preserveLocalSyncSettings(content, local);
      const data = parse(result);
      for (const key of Object.keys(local)) {
        assert.strictEqual(data["sync." + key], local[key], key);
      }
      if (content.includes("comment"))
        assert.ok(result.includes("// preserved comment"));
    }
  });

  it("does not add keys outside ExtensionConfig or change imported token handling", () => {
    const settings = Object.assign(new ExtensionConfig(), {
      token: "local-token",
      other: true
    });
    const data = parse(
      preserveLocalSyncSettings('{"sync.token":"imported"}', settings)
    );
    assert.strictEqual(data["sync.token"], "imported");
    assert.strictEqual(data["sync.other"], undefined);
  });

  it("rejects invalid JSONC and a non-object settings root or sync section", () => {
    for (const content of [
      '{"sync.gist":',
      '{"x":undefined}',
      "[]",
      "null",
      '{"sync":false}'
    ]) {
      assert.throws(() => preserveLocalSyncSettings(content, local), /object/);
    }
  });
});
