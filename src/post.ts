import * as core from "@actions/core";
import * as cache from "@actions/cache";

async function post(): Promise<void> {
	try {
		const primaryKey = core.getState("PLUGIN_CACHE_KEY");
		const cacheDir = core.getState("PLUGIN_CACHE_DIR");
		const exactHit = core.getState("PLUGIN_CACHE_EXACT_HIT");

		if (primaryKey === "" || cacheDir === "") {
			core.info("No plugin cache key saved — nothing to do");
			return;
		}

		if (exactHit === "true") {
			core.info("Plugin cache already up-to-date — skipping save");
			return;
		}

		core.info(`Saving plugin cache: ${cacheDir} → ${primaryKey}`);

		try {
			await cache.saveCache([cacheDir], primaryKey);
			core.info("Plugin cache saved");
		} catch (error) {
			// "cache already exists" is not an error — another job may have saved it
			if (
				error instanceof Error &&
				error.message.includes("already exists")
			) {
				core.info("Plugin cache entry already exists");
			} else {
				throw error;
			}
		}
	} catch (error) {
		// Post steps should warn, not fail the job
		if (error instanceof Error) {
			core.warning(`Plugin cache save failed: ${error.message}`);
		} else {
			core.warning(`Plugin cache save failed: ${String(error)}`);
		}
	}
}

void post();
