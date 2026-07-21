import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { restoreCache } from "@actions/cache";
import { exportVariable, getInput, info, saveState, setFailed, setOutput } from "@actions/core";
import { computeCacheKey, findConfigFiles } from "./config.ts";
import { installDprint } from "./install.ts";
import { warmupPlugins } from "./warmup.ts";

/** WASM plugin cache directory.
 * @returns Absolute path to plugin cache dir.
 */
function pluginCacheDir(): string {
	return env["DPRINT_CACHE_DIR"] ?? join(homedir(), ".cache", "dprint");
}

/** Main entry point for the action. */
async function run(): Promise<void> {
	try {
		const versionInput = getInput("version") || "latest";
		const cacheEnabled = getInput("cache") !== "false";
		const warmupEnabled = getInput("warmup") !== "false";
		const configPathInput = getInput("config-path") || undefined;

		/** dprint's default cache dir differs per OS (~/.cache/dprint on Linux,
		 * ~/Library/Caches/dprint on macOS, %LOCALAPPDATA%\dprint on Windows);
		 * pinning it makes the cached path and the used path identical everywhere.
		 */
		const cacheDir = pluginCacheDir();
		exportVariable("DPRINT_CACHE_DIR", cacheDir);

		const { version, location } = await installDprint(versionInput, cacheEnabled);
		info(`dprint ${version} ready at ${location}`);

		// Plugin cache restore
		if (!cacheEnabled) return;

		const configPaths = await findConfigFiles(configPathInput);
		const primaryConfig = configPaths[0];
		if (primaryConfig === undefined) {
			info("No dprint config found, skipping plugin cache");
			return;
		}

		info(`Found config: ${configPaths.join(", ")}`);

		const { primaryKey, restoreKeys } = computeCacheKey(configPaths, version);

		saveState("PLUGIN_CACHE_KEY", primaryKey);
		saveState("PLUGIN_CACHE_DIR", cacheDir);
		setOutput("plugin-cache-key", primaryKey);

		const hitKey = await restoreCache([cacheDir], primaryKey, restoreKeys);

		const isExactHit = hitKey === primaryKey;
		setOutput("plugin-cache-hit", isExactHit);

		if (hitKey !== undefined) {
			info(`Plugin cache restored from: ${hitKey}`);
			if (isExactHit) saveState("PLUGIN_CACHE_EXACT_HIT", "true");
		} else info("Plugin cache miss");

		/** On anything but an exact hit, pre-download the plugins now so the
		 * post step has a complete store to save even if later dprint steps
		 * fail (a failing format check still warms the next run).
		 */
		if (warmupEnabled && !isExactHit) await warmupPlugins(location, primaryConfig);
	} catch (error) {
		if (error instanceof Error) setFailed(error.message);
		else setFailed(String(error));
	}
}

void run();
