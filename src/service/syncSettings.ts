import { applyEdits, Edit, modify, ParseError, parseTree } from "jsonc-parser";
import { ExtensionConfig } from "../models/extensionConfig.model";

/** Preserve this profile's sync options before replacing its settings file. */
export function preserveLocalSyncSettings(
  content: string,
  settings: ExtensionConfig
): string {
  const errors: ParseError[] = [];
  const root = parseTree(content, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true
  });
  if (errors.length || (root && root.type !== "object")) {
    throw new Error("Imported settings.json must be a valid JSONC object.");
  }

  const values = new Map<string, string | boolean>();
  const keys = Object.keys(new ExtensionConfig()) as Array<
    keyof ExtensionConfig
  >;
  for (const key of keys) {
    values.set(key, settings[key] == null ? "" : settings[key]);
  }
  return preserveObjectOptions(content, values, "sync.");
}

function preserveObjectOptions(
  content: string,
  values: Map<string, string | boolean>,
  prefix: string
): string {
  const root = parseTree(content, [], {
    allowTrailingComma: true,
    allowEmptyContent: true
  });
  const edits: Edit[] = [];
  const found = new Set<string>();
  for (const property of (root && root.children) || []) {
    const name = property.children[0].value as string;
    const value = property.children[1];
    if (prefix && name === "sync") {
      if (value.type !== "object") {
        throw new Error(
          "The imported sync settings section must be an object."
        );
      }
      edits.push({
        offset: value.offset,
        length: value.length,
        content: preserveObjectOptions(
          content.slice(value.offset, value.offset + value.length),
          values,
          ""
        )
      });
    } else if (
      name.startsWith(prefix) &&
      values.has(name.slice(prefix.length))
    ) {
      const key = name.slice(prefix.length);
      edits.push({
        offset: value.offset,
        length: value.length,
        content: JSON.stringify(values.get(key))
      });
      found.add(key);
    }
  }
  // Every duplicate or nested section receives all local options. A later
  // partial section cannot overwrite an earlier section and drop local keys.
  let result = applyEdits(content, edits);
  for (const [key, value] of Array.from(values)) {
    if (!found.has(key)) {
      result = applyEdits(
        result,
        modify(result, [prefix + key], value, {
          formattingOptions: {
            insertSpaces: true,
            tabSize: 2,
            eol: content.includes("\r\n") ? "\r\n" : "\n"
          }
        })
      );
    }
  }
  return result;
}
