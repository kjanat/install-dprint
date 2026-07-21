import { dirname } from "node:path";
import { info, warning } from "@actions/core";
import { execFileAsync } from "./exec.ts";

const ATTEMPTS = 3;
const TIMEOUT_MS = 60_000;

/** Whether an execFile error is the timeout kill rather than a real failure.
 * @param    error   The error to check.
 * @returns          `true` if the error is a timeout kill, `false` otherwise.
 */
function isTimeoutKill(error: unknown): boolean {
	if (error === null || typeof error !== "object") return false;
	const killed = "killed" in error && error.killed === true;
	const signal = "signal" in error && (error.signal === "SIGTERM" || error.signal === "SIGKILL");
	return killed && signal;
}

/** Describe an error as a string, whether it's an Error object or not.
 * @param    error  The error to describe.
 * @returns         The error message or string representation.
 */
function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Pre-resolve the config's WASM plugins so later dprint invocations run offline against the cached plugin store.
 *
 * Best-effort: `plugins.dprint.dev` occasionally stalls mid-download, so each attempt is bounded and only timeouts
 * retry — real failures (bad config, unknown plugin) surface once as a warning without failing the action.
 *
 * @param    binaryPath  Absolute path to the dprint binary.
 * @param    configPath  Absolute path to the dprint config file.
 * @returns              `true` if warmup succeeded, `false` if it failed or hung.
 */
export async function warmupPlugins(binaryPath: string, configPath: string): Promise<boolean> {
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		try {
			await execFileAsync(binaryPath, ["output-file-paths", "--config", configPath], {
				timeout: TIMEOUT_MS,
				cwd: dirname(configPath),
				maxBuffer: 64 * 1024 * 1024,
			});
			info("Plugin warmup complete");
			return true;
		} catch (error) {
			if (isTimeoutKill(error)) {
				info(`Plugin warmup hung (>${TIMEOUT_MS / 1000}s), attempt ${attempt}/${ATTEMPTS}`);
				continue;
			}
			warning(`Plugin warmup failed: ${describe(error)}`);
			return false;
		}
	}
	warning(`Plugin warmup kept hanging after ${ATTEMPTS} attempts`);
	return false;
}
