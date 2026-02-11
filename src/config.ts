import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as path from "node:path";
import * as glob from "@actions/glob";

/** Config file names dprint recognizes, in priority order. */
const CONFIG_NAMES = [
	".dprint.jsonc",
	".dprint.json",
	"dprint.jsonc",
	"dprint.json",
] as const;

/**
 * Find the dprint config file in the workspace.
 *
 * - If `customPath` is provided, uses it as a glob pattern.
 * - Otherwise, searches the workspace for known config file names.
 *
 * Returns the absolute path to the first matching file, or null.
 */
export async function findConfigFile(
	customPath?: string,
): Promise<string | null> {
	if (customPath !== undefined && customPath.trim() !== "") {
		const globber = await glob.create(customPath, {
			followSymbolicLinks: false,
		});
		const matches = await globber.glob();
		return matches[0] ?? null;
	}

	// Search workspace root for known config names
	const workspace = process.env["GITHUB_WORKSPACE"] ?? process.cwd();

	for (const name of CONFIG_NAMES) {
		const candidate = path.join(workspace, name);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	// Deep search as fallback
	const patterns = CONFIG_NAMES.map((n) => path.join(workspace, "**", n));
	const globber = await glob.create(patterns.join("\n"), {
		followSymbolicLinks: false,
	});
	const matches = await globber.glob();

	return matches[0] ?? null;
}

/**
 * Compute a deterministic cache key for dprint WASM plugins.
 *
 * Key format: `dprint-plugins-{os}-{dprintVersion}-{configHash}`
 *
 * The config hash ensures plugins are re-downloaded when the config
 * changes (e.g., new plugin versions via `dprint config update`).
 * The dprint version is included because plugins may be version-sensitive.
 */
export function computeCacheKey(
	configPath: string,
	dprintVersion: string,
): { primaryKey: string; restoreKeys: string[] } {
	const content = fs.readFileSync(configPath, "utf-8");
	const hash = crypto.createHash("sha256").update(content).digest("hex");

	const runner = process.env["RUNNER_OS"] ?? process.platform;

	const primaryKey = `dprint-plugins-${runner}-${dprintVersion}-${hash}`;
	const restoreKeys = [
		`dprint-plugins-${runner}-${dprintVersion}-`,
		`dprint-plugins-${runner}-`,
	];

	return { primaryKey, restoreKeys };
}
