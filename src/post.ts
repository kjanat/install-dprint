import { saveCache } from "@actions/cache";
import { getState, info, warning } from "@actions/core";

/** Save a cache entry, tolerating a concurrent job having saved it already.
 *
 * @param  paths  Paths to cache.
 * @param  key    Cache key to save.
 * @param  label  Label for logging.
 */
async function save(paths: string[], key: string, label: string): Promise<void> {
	info(`Saving ${label}: ${paths.join(", ")} -> ${key}`);
	try {
		await saveCache(paths, key);
		info(`${label} saved`);
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) info(`${label} entry already exists`);
		else throw error;
	}
}

/** Post step to save the binary and plugin caches. */
async function post(): Promise<void> {
	try {
		const binaryKey = getState("BIN_CACHE_KEY");
		const binaryDir = getState("BIN_CACHE_DIR");
		if (binaryKey !== "" && binaryDir !== "") await save([binaryDir], binaryKey, "Binary cache");

		const primaryKey = getState("PLUGIN_CACHE_KEY");
		const cacheDir = getState("PLUGIN_CACHE_DIR");
		const exactHit = getState("PLUGIN_CACHE_EXACT_HIT");

		if (primaryKey === "" || cacheDir === "") {
			info("No plugin cache key saved, nothing to do");
			return;
		}

		if (exactHit === "true") {
			info("Plugin cache already up-to-date, skipping save");
			return;
		}

		await save([cacheDir], primaryKey, "Plugin cache");
	} catch (error) {
		// Post steps should warn, not fail the job
		if (error instanceof Error) warning(`Cache save failed: ${error.message}`);
		else warning(`Cache save failed: ${String(error)}`);
	}
}

void post();
