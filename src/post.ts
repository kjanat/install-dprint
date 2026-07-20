import * as cache from "@actions/cache";
import * as core from "@actions/core";

/** Save a cache entry, tolerating a concurrent job having saved it already. */
async function save(
	paths: string[],
	key: string,
	label: string,
): Promise<void> {
	core.info(`Saving ${label}: ${paths.join(", ")} -> ${key}`);
	try {
		await cache.saveCache(paths, key);
		core.info(`${label} saved`);
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) {
			core.info(`${label} entry already exists`);
		} else {
			throw error;
		}
	}
}

async function post(): Promise<void> {
	try {
		const binaryKey = core.getState("BIN_CACHE_KEY");
		const binaryDir = core.getState("BIN_CACHE_DIR");
		if (binaryKey !== "" && binaryDir !== "") {
			await save([binaryDir], binaryKey, "Binary cache");
		}

		const primaryKey = core.getState("PLUGIN_CACHE_KEY");
		const cacheDir = core.getState("PLUGIN_CACHE_DIR");
		const exactHit = core.getState("PLUGIN_CACHE_EXACT_HIT");

		if (primaryKey === "" || cacheDir === "") {
			core.info("No plugin cache key saved, nothing to do");
			return;
		}

		if (exactHit === "true") {
			core.info("Plugin cache already up-to-date, skipping save");
			return;
		}

		await save([cacheDir], primaryKey, "Plugin cache");
	} catch (error) {
		// Post steps should warn, not fail the job
		if (error instanceof Error) {
			core.warning(`Cache save failed: ${error.message}`);
		} else {
			core.warning(`Cache save failed: ${String(error)}`);
		}
	}
}

void post();
