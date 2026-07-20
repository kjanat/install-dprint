import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as os from "node:os";
import * as path from "node:path";
import { computeCacheKey, findConfigFiles } from "./config.js";
import { installDprint } from "./install.js";
import { warmupPlugins } from "./warmup.js";

/** WASM plugin cache directory. */
function pluginCacheDir(): string {
	return (
		process.env["DPRINT_CACHE_DIR"]
			?? path.join(os.homedir(), ".cache", "dprint")
	);
}

async function run(): Promise<void> {
	try {
		const versionInput = core.getInput("version") || "latest";
		const cacheEnabled = core.getInput("cache") !== "false";
		const warmupEnabled = core.getInput("warmup") !== "false";
		const configPathInput = core.getInput("config-path") || undefined;

		// dprint's default cache dir differs per OS (~/.cache/dprint on Linux,
		// ~/Library/Caches/dprint on macOS, %LOCALAPPDATA%\dprint on Windows);
		// pinning it makes the cached path and the used path identical everywhere.
		const cacheDir = pluginCacheDir();
		core.exportVariable("DPRINT_CACHE_DIR", cacheDir);

		const { version, location } = await installDprint(
			versionInput,
			cacheEnabled,
		);
		core.info(`dprint ${version} ready at ${location}`);

		// Plugin cache restore
		if (!cacheEnabled) return;

		const configPaths = await findConfigFiles(configPathInput);
		const primaryConfig = configPaths[0];
		if (primaryConfig === undefined) {
			core.info("No dprint config found, skipping plugin cache");
			return;
		}

		core.info(`Found config: ${configPaths.join(", ")}`);

		const { primaryKey, restoreKeys } = computeCacheKey(
			configPaths,
			version,
		);

		core.saveState("PLUGIN_CACHE_KEY", primaryKey);
		core.saveState("PLUGIN_CACHE_DIR", cacheDir);
		core.setOutput("plugin-cache-key", primaryKey);

		const hitKey = await cache.restoreCache(
			[cacheDir],
			primaryKey,
			restoreKeys,
		);

		const isExactHit = hitKey === primaryKey;
		core.setOutput("plugin-cache-hit", isExactHit);

		if (hitKey !== undefined) {
			core.info(`Plugin cache restored from: ${hitKey}`);
			if (isExactHit) {
				core.saveState("PLUGIN_CACHE_EXACT_HIT", "true");
			}
		} else {
			core.info("Plugin cache miss");
		}

		// On anything but an exact hit, pre-download the plugins now so the
		// post step has a complete store to save even if later dprint steps
		// fail (a failing format check still warms the next run).
		if (warmupEnabled && !isExactHit) {
			await warmupPlugins(location, primaryConfig);
		}
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed(String(error));
		}
	}
}

void run();
