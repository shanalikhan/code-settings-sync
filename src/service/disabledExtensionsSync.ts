/**
 * disabledExtensionsSync.ts
 *
 * Feature for shanalikhan/code-settings-sync — Issue #143:
 * "Considering disabled extensions"
 *
 * PROBLEM
 * -------
 * Code Settings Sync uploads/downloads the `extensions.json` file which lists
 * installed extensions. When a user syncs to another machine, extensions that
 * were *deliberately disabled* on the source machine get re-enabled on the
 * target (or are simply re-installed and enabled), which is surprising and
 * loses the user's intent.
 *
 * SOLUTION
 * --------
 * Persist the set of *disabled* extension ids alongside the synced settings and
 * re-apply that disable state after every download. VS Code exposes the global
 * state key `extensionsIdentifiers/disabled` (an array of extension ids) via the
 * `globalState` / `State` API. We read it on upload, store it inside the synced
 * settings payload, and on download we merge it back into globalState so VS Code
 * restores the disabled state on restart.
 *
 * This module is intentionally dependency-light and unit-testable: it operates
 * on plain arrays of extension ids and never touches the network directly.
 */

export const DISABLED_EXTENSIONS_STATE_KEY = 'extensionsIdentifiers/disabled';

/**
 * Normalise an extension id / identifier entry to a lowercase `publisher.name`
 * string. VS Code stores disabled identifiers as strings ("publisher.name") in
 * recent versions and as `{ id: "publisher.name" }` objects in older versions.
 */
export function normaliseExtensionId(entry: unknown): string | undefined {
  if (typeof entry === 'string') {
    return entry.trim().toLowerCase() || undefined;
  }
  if (entry && typeof entry === 'object' && 'id' in entry) {
    const id = (entry as { id?: unknown }).id;
    if (typeof id === 'string') {
      return id.trim().toLowerCase() || undefined;
    }
  }
  return undefined;
}

/**
 * Extract a clean, de-duplicated, sorted list of disabled extension ids from the
 * raw value stored under `extensionsIdentifiers/disabled`.
 */
export function extractDisabledExtensions(rawState: unknown): string[] {
  if (!Array.isArray(rawState)) {
    return [];
  }
  const ids = rawState
    .map(normaliseExtensionId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  return Array.from(new Set(ids)).sort();
}

/**
 * Build the payload fragment that should be stored with the synced settings so
 * the disabled state travels with the user's configuration.
 */
export function buildDisabledExtensionsPayload(rawState: unknown): {
  [DISABLED_EXTENSIONS_STATE_KEY]: string[];
} {
  return { [DISABLED_EXTENSIONS_STATE_KEY]: extractDisabledExtensions(rawState) };
}

/**
 * Merge a previously-synced disabled-extension list into the current local
 * state. The union is used so that:
 *   - extensions disabled locally are preserved, and
 *   - extensions disabled on the source machine are also disabled here.
 *
 * Returns the new list to write back to globalState (de-duplicated + sorted),
 * plus a boolean indicating whether anything actually changed so callers can
 * avoid a needless state write / restart prompt.
 */
export function mergeDisabledExtensions(
  localRawState: unknown,
  syncedRawState: unknown
): { ids: string[]; changed: boolean } {
  const local = extractDisabledExtensions(localRawState);
  const synced = extractDisabledExtensions(syncedRawState);

  const merged = Array.from(new Set([...local, ...synced])).sort();
  const changed =
    merged.length !== local.length ||
    merged.some((id, i) => id !== local[i]);

  return { ids: merged, changed };
}