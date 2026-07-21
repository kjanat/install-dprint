import { existsSync } from "node:fs";
import { arch, homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { env } from "node:process";
import { restoreCache } from "@actions/cache";
import { addPath, info, saveState, setOutput } from "@actions/core";
import { exec } from "@actions/exec";
import { cp, mkdirP } from "@actions/io";
import { cacheDir, downloadTool, extractZip, find as tcFind } from "@actions/tool-cache";
import { getTarget } from "./platform.ts";
import { resolveVersion } from "./version.ts";

/** Where dprint installs to by default.
 * @returns Absolute path to install dir.
 */
function installDir(): string {
	return (env["DPRINT_INSTALL"] ?? join(homedir(), ".dprint"));
}

/** Download, extract, and install the dprint binary. Returns path to binary.
 *
 * @param    versionInput  Version string to resolve (e.g. "0.34.0" or "latest").
 * @param    cacheEnabled  Whether to use actions/cache for the binary.
 * @returns                Installed version, binary path, and whether it was a cache hit.
 */
export async function installDprint(versionInput: string, cacheEnabled: boolean): Promise<{
	version: string;
	location: string;
	cacheHit: boolean;
}> {
	const version = await resolveVersion(versionInput);
	info(`Resolved dprint version: ${version}`);

	const target = await getTarget();
	info(`Detected platform target: ${target}`);

	const ext = platform() === "win32" ? ".exe" : "";

	// Tool-cache only persists on self-hosted runners; check it first anyway.
	const cachedDir = tcFind("dprint", version);
	if (cachedDir) {
		info(`Cache hit: dprint ${version} from tool-cache`);
		const binaryPath = join(cachedDir, `dprint${ext}`);
		return finalize(binaryPath, true);
	}

	const binDir = join(installDir(), "bin", version);
	const binaryPath = join(binDir, `dprint${ext}`);
	const runner = env["RUNNER_OS"] ?? platform();
	const binaryKey = `dprint-bin-${runner}-${arch()}-${version}`;

	// Hosted runners get a fresh tool cache every job; actions/cache is what
	// actually persists the binary across runs.
	if (cacheEnabled) {
		const hitKey = await restoreCache([binDir], binaryKey);
		if (hitKey !== undefined && existsSync(binaryPath)) {
			info(`Cache hit: dprint ${version} from actions/cache`);
			return finalize(binaryPath, true);
		}
	}

	info("Cache miss: downloading dprint");

	const url = `https://github.com/dprint/dprint/releases/download/${version}/dprint-${target}.zip`;
	info(`Downloading: ${url}`);

	const zipPath = await downloadTool(url);
	const extractedDir = await extractZip(zipPath);
	const extractedBinary = join(extractedDir, `dprint${ext}`);

	if (platform() !== "win32") await exec("chmod", ["+x", extractedBinary]);

	await mkdirP(binDir);
	await cp(extractedBinary, binaryPath);

	// Populate the tool cache too, so self-hosted runners skip the download.
	await cacheDir(extractedDir, "dprint", version);

	if (cacheEnabled) {
		saveState("BIN_CACHE_KEY", binaryKey);
		saveState("BIN_CACHE_DIR", binDir);
	}

	return finalize(binaryPath, false);
}

/** Add to PATH, set outputs, verify binary works.
 *
 * @param    binaryPath  Absolute path to dprint binary.
 * @param    cacheHit    Whether the binary was restored from cache.
 * @returns              Installed version, binary path, and whether it was a cache hit.
 */
async function finalize(
	binaryPath: string,
	cacheHit: boolean,
): Promise<{ version: string; location: string; cacheHit: boolean }> {
	const binDir = dirname(binaryPath);
	addPath(binDir);

	// Verify it works
	let actualVersion = "";
	await exec(binaryPath, ["--version"], {
		listeners: {
			stdout: (data: Buffer) => {
				actualVersion += data.toString();
			},
		},
	});
	actualVersion = actualVersion.trim().split(" ").pop() ?? actualVersion.trim();

	setOutput("version", actualVersion);
	setOutput("location", binaryPath);
	setOutput("cache-hit", cacheHit);

	info(`dprint ${actualVersion} ready at ${binaryPath}`);

	return { version: actualVersion, location: binaryPath, cacheHit };
}
