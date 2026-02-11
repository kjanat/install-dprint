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
		if (cacheEnabled) {
			const configPath = await findConfigFile(configPathInput);

			if (configPath !== null) {
				core.info(`Found config: ${configPath}`);

				const { primaryKey, restoreKeys } = computeCacheKey(
					configPath,
					version,
				);

				core.saveState("PLUGIN_CACHE_KEY", primaryKey);
				core.saveState("PLUGIN_CACHE_DIR", pluginCacheDir());

				const hitKey = await cache.restoreCache(
					[pluginCacheDir()],
					primaryKey,
					restoreKeys,
				);

				if (hitKey !== undefined) {
					core.info(`Plugin cache hit: ${hitKey}`);
					// Exact match means no need to save in post step
					if (hitKey === primaryKey) {
						core.saveState("PLUGIN_CACHE_EXACT_HIT", "true");
					}
				} else {
					core.info("Plugin cache miss");
				}
			} else {
				core.info(
					"No dprint config found — skipping plugin cache restore",
				);
			}
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
