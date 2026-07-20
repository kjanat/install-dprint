import * as glob from "@actions/glob";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/** Config file names dprint recognizes, in priority order. */
const CONFIG_NAMES = [
	".dprint.jsonc",
	".dprint.json",
	"dprint.jsonc",
	"dprint.json",
] as const;

/**
 * Find dprint config files in the workspace.
 *
 * - If `customPath` is provided, uses it as a glob pattern and returns every
 *   match.
 * - Otherwise, deep-searches the whole workspace for known config file names
 *   (skipping `node_modules` and `.git`) and returns every match, so a
 *   monorepo's per-directory configs all feed the cache key.
 *
 * Returns absolute paths; the first entry is the primary config — the
 * highest-priority name at the workspace root when present, otherwise the
 * first match.
 */
export async function findConfigFiles(customPath?: string): Promise<string[]> {
	if (customPath !== undefined && customPath.trim() !== "") {
		const globber = await glob.create(customPath, {
			followSymbolicLinks: false,
		});
		return await globber.glob();
	}

	const workspace = process.env["GITHUB_WORKSPACE"] ?? process.cwd();

	const patterns = [
		...CONFIG_NAMES.map((n) => path.join(workspace, "**", n)),
		`!${path.join(workspace, "**", "node_modules", "**")}`,
		`!${path.join(workspace, "**", ".git", "**")}`,
	];
	const globber = await glob.create(patterns.join("\n"), {
		followSymbolicLinks: false,
	});
	const matches = (await globber.glob()).sort();

	for (const name of CONFIG_NAMES) {
		const rootCandidate = path.join(workspace, name);
		if (matches.includes(rootCandidate)) {
			return [
				rootCandidate,
				...matches.filter((m) => m !== rootCandidate),
			];
		}
	}

	return matches;
}

/**
 * Compute a deterministic cache key for dprint WASM plugins.
 *
 * Key format: `dprint-plugins-{os}-{dprintVersion}-{configHash}`
 *
 * The hash covers every config file (path-sorted), so plugins are
 * re-downloaded when any config changes (e.g. new plugin versions via
 * `dprint config update`). The dprint version is included because plugins
 * may be version-sensitive.
 */
export function computeCacheKey(
	configPaths: readonly string[],
	dprintVersion: string,
): { primaryKey: string; restoreKeys: string[] } {
	const hash = crypto.createHash("sha256");
	for (const configPath of [...configPaths].sort()) {
		hash.update(configPath);
		hash.update(fs.readFileSync(configPath, "utf-8"));
	}
	const digest = hash.digest("hex");

	const runner = process.env["RUNNER_OS"] ?? process.platform;

	const primaryKey = `dprint-plugins-${runner}-${dprintVersion}-${digest}`;
	const restoreKeys = [
		`dprint-plugins-${runner}-${dprintVersion}-`,
		`dprint-plugins-${runner}-`,
	];

	return { primaryKey, restoreKeys };
}
