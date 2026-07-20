import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getTarget } from "./platform.js";
import { resolveVersion } from "./version.js";

/** Where dprint installs to by default. */
function installDir(): string {
	return (
		process.env["DPRINT_INSTALL"]
			?? path.join(os.homedir(), ".dprint")
	);
}

/** Download, extract, and install the dprint binary. Returns path to binary. */
export async function installDprint(
	versionInput: string,
	cacheEnabled: boolean,
): Promise<{
	version: string;
	location: string;
	cacheHit: boolean;
}> {
	const version = await resolveVersion(versionInput);
	core.info(`Resolved dprint version: ${version}`);

	const target = await getTarget();
	core.info(`Detected platform target: ${target}`);

	const ext = os.platform() === "win32" ? ".exe" : "";

	// Tool-cache only persists on self-hosted runners; check it first anyway.
	const cachedDir = tc.find("dprint", version);
	if (cachedDir) {
		core.info(`Cache hit: dprint ${version} from tool-cache`);
		const binaryPath = path.join(cachedDir, `dprint${ext}`);
		return finalize(binaryPath, true);
	}

	const binDir = path.join(installDir(), "bin", version);
	const binaryPath = path.join(binDir, `dprint${ext}`);
	const runner = process.env["RUNNER_OS"] ?? os.platform();
	const binaryKey = `dprint-bin-${runner}-${os.arch()}-${version}`;

	// Hosted runners get a fresh tool cache every job; actions/cache is what
	// actually persists the binary across runs.
	if (cacheEnabled) {
		const hitKey = await cache.restoreCache([binDir], binaryKey);
		if (hitKey !== undefined && fs.existsSync(binaryPath)) {
			core.info(`Cache hit: dprint ${version} from actions/cache`);
			return finalize(binaryPath, true);
		}
	}

	core.info("Cache miss: downloading dprint");

	const url = `https://github.com/dprint/dprint/releases/download/${version}/dprint-${target}.zip`;
	core.info(`Downloading: ${url}`);

	const zipPath = await tc.downloadTool(url);
	const extractedDir = await tc.extractZip(zipPath);
	const extractedBinary = path.join(extractedDir, `dprint${ext}`);

	if (os.platform() !== "win32") {
		await exec.exec("chmod", ["+x", extractedBinary]);
	}

	await io.mkdirP(binDir);
	await io.cp(extractedBinary, binaryPath);

	// Populate the tool cache too, so self-hosted runners skip the download.
	await tc.cacheDir(extractedDir, "dprint", version);

	if (cacheEnabled) {
		core.saveState("BIN_CACHE_KEY", binaryKey);
		core.saveState("BIN_CACHE_DIR", binDir);
	}

	return finalize(binaryPath, false);
}

/** Add to PATH, set outputs, verify binary works. */
async function finalize(
	binaryPath: string,
	cacheHit: boolean,
): Promise<{ version: string; location: string; cacheHit: boolean }> {
	const binDir = path.dirname(binaryPath);
	core.addPath(binDir);

	// Verify it works
	let actualVersion = "";
	await exec.exec(binaryPath, ["--version"], {
		listeners: {
			stdout: (data: Buffer) => {
				actualVersion += data.toString();
			},
		},
	});
	actualVersion = actualVersion.trim().split(" ").pop() ?? actualVersion.trim();

	core.setOutput("version", actualVersion);
	core.setOutput("location", binaryPath);
	core.setOutput("cache-hit", cacheHit);

	core.info(`dprint ${actualVersion} ready at ${binaryPath}`);

	return { version: actualVersion, location: binaryPath, cacheHit };
}
