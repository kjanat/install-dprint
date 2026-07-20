import * as core from "@actions/core";
import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ATTEMPTS = 3;
const TIMEOUT_MS = 60_000;

/** Whether an execFile error is the timeout kill rather than a real failure. */
function isTimeoutKill(error: unknown): boolean {
	if (error === null || typeof error !== "object") return false;
	const killed = "killed" in error && error.killed === true;
	const signal = "signal" in error
		&& (error.signal === "SIGTERM" || error.signal === "SIGKILL");
	return killed && signal;
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Pre-resolve the config's WASM plugins so later dprint invocations run
 * offline against the cached plugin store.
 *
 * Best-effort: plugins.dprint.dev occasionally stalls mid-download, so each
 * attempt is bounded and only timeouts retry — real failures (bad config,
 * unknown plugin) surface once as a warning without failing the action.
 */
export async function warmupPlugins(
	binaryPath: string,
	configPath: string,
): Promise<boolean> {
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		try {
			await execFileAsync(
				binaryPath,
				["output-file-paths", "--config", configPath],
				{
					timeout: TIMEOUT_MS,
					cwd: path.dirname(configPath),
					maxBuffer: 64 * 1024 * 1024,
				},
			);
			core.info("Plugin warmup complete");
			return true;
		} catch (error) {
			if (isTimeoutKill(error)) {
				core.info(
					`Plugin warmup hung (>${TIMEOUT_MS / 1000}s), attempt ${attempt}/${ATTEMPTS}`,
				);
				continue;
			}
			core.warning(`Plugin warmup failed: ${describe(error)}`);
			return false;
		}
	}
	core.warning(`Plugin warmup kept hanging after ${ATTEMPTS} attempts`);
	return false;
}
