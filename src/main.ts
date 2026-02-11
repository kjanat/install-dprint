import * as path from "node:path";
import * as os from "node:os";
import * as core from "@actions/core";
import * as cache from "@actions/cache";
import { installDprint } from "./install.js";
import { findConfigFile, computeCacheKey } from "./config.js";

/** Default WASM plugin cache directory. */
function pluginCacheDir(): string {
	return (
		process.env["DPRINT_CACHE_DIR"] ??
		path.join(os.homedir(), ".cache", "dprint")
	);
}

async function run(): Promise<void> {
	try {
		const versionInput = core.getInput("version") || "latest";
		const cacheEnabled = core.getInput("cache") !== "false";
		const configPathInput = core.getInput("config-path") || undefined;

		const { version, location } = await installDprint(versionInput);
		core.info(`dprint ${version} ready at ${location}`);

		// Plugin cache restore
		if (!cacheEnabled) return;

		const configPath = await findConfigFile(configPathInput);
		if (configPath === null) {
			core.info("No dprint config found — skipping plugin cache");
			return;
		}

		core.info(`Found config: ${configPath}`);

		const { primaryKey, restoreKeys } = computeCacheKey(
			configPath,
			version,
		);

		core.saveState("PLUGIN_CACHE_KEY", primaryKey);
		core.saveState("PLUGIN_CACHE_DIR", pluginCacheDir());
		core.setOutput("plugin-cache-key", primaryKey);

		const hitKey = await cache.restoreCache(
			[pluginCacheDir()],
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
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed(String(error));
		}
	}
}

void run();
