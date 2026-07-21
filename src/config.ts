import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, env, platform } from "node:process";
import { create as globCreate } from "@actions/glob";

/** Config file names dprint recognizes, in priority order. */
const CONFIG_NAMES = [".dprint.jsonc", ".dprint.json", "dprint.jsonc", "dprint.json"] as const;

/** Find dprint config files in the workspace.
 *
 * - If {@link customPath} is provided, uses it as a glob pattern and returns every match.
 * - Otherwise, deep-searches the whole workspace for known config file names (skipping `node_modules` and `.git`)
 *   and returns every match, so a monorepo's per-directory configs all feed the cache key.
 *
 * Returns absolute paths; the first entry is the primary config — the highest-priority name at the workspace root when
 * present, otherwise the first match.
 *
 * @param    customPath  Optional glob pattern to use instead of searching the workspace.
 * @returns              Absolute paths of config files, sorted by priority.
 */
export async function findConfigFiles(customPath?: string): Promise<string[]> {
	if (customPath !== undefined && customPath.trim() !== "") {
		const globber = await globCreate(customPath, {
			followSymbolicLinks: false,
		});
		return await globber.glob();
	}

	const workspace = env["GITHUB_WORKSPACE"] ?? cwd();

	const patterns = [
		...CONFIG_NAMES.map((n) => join(workspace, "**", n)),
		`!${join(workspace, "**", "node_modules", "**")}`,
		`!${join(workspace, "**", ".git", "**")}`,
	];
	const globber = await globCreate(patterns.join("\n"), { followSymbolicLinks: false });
	const matches = (await globber.glob()).sort();

	for (const name of CONFIG_NAMES) {
		const rootCandidate = join(workspace, name);
		if (matches.includes(rootCandidate)) {
			return [
				rootCandidate,
				...matches.filter((m) => m !== rootCandidate),
			];
		}
	}

	return matches;
}

/** Compute a deterministic cache key for dprint WASM plugins.
 *
 * Key format: `dprint-plugins-{os}-{dprintVersion}-{configHash}`
 *
 * The hash covers every config file (path-sorted), so plugins are re-downloaded when any config changes
 * (e.g. new plugin versions via `dprint config update -yr`).
 * The dprint version is included because plugins may be version-sensitive.
 *
 * @param    configPaths    Absolute paths of dprint config files, sorted by priority.
 * @param    dprintVersion  The dprint version to include in the cache key.
 * @returns                 The primary cache key and restore keys.
 */
export function computeCacheKey(
	configPaths: readonly string[],
	dprintVersion: string,
): { primaryKey: string; restoreKeys: string[] } {
	const hash = createHash("sha256");
	for (const configPath of [...configPaths].sort()) {
		hash.update(configPath);
		hash.update(readFileSync(configPath, "utf-8"));
	}
	const digest = hash.digest("hex");

	const runner = env["RUNNER_OS"] ?? platform;
	const primaryKey = `dprint-plugins-${runner}-${dprintVersion}-${digest}`;
	const restoreKeys = [`dprint-plugins-${runner}-${dprintVersion}-`, `dprint-plugins-${runner}-`];

	return { primaryKey, restoreKeys };
}
