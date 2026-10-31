import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";
import { env } from "node:process";
import { restoreCache } from "@actions/cache";
import { addPath, info, saveState, setOutput } from "@actions/core";
import { exec } from "@actions/exec";
import { cp, mkdirP } from "@actions/io";
import { cacheDir, downloadTool, extractZip, HTTPError, find as tcFind } from "@actions/tool-cache";
import { getTarget } from "./platform.ts";
import { parseRepository, type ReleaseRepository } from "./repository.ts";
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
export async function installDprint(
	versionInput: string,
	cacheEnabled: boolean,
	repository: ReleaseRepository = parseRepository(),
): Promise<{
	version: string;
	location: string;
	cacheHit: boolean;
}> {
	const version = await resolveVersion(versionInput, repository);
	info(`Resolved dprint version: ${version}`);

	const target = await getTarget();
	info(`Detected platform target: ${target}`);

	const ext = platform() === "win32" ? ".exe" : "";

	// Tool-cache only persists on self-hosted runners; check it first anyway.
	// tool-cache normalizes semver tags. Hash the exact tag into the tool name
	// and use a fixed semver slot so arbitrary fork tags also remain distinct.
	const tagKey = createHash("sha256").update(version).digest("hex");
	const toolName = `dprint-${repository.cacheKey}-${target}-${tagKey}`;
	const cachedDir = cacheEnabled ? tcFind(toolName, "0.0.0") : "";
	const cachedBinary = cachedDir ? findBinary(cachedDir, ext) : undefined;
	if (cachedBinary !== undefined) {
		info(`Cache hit: dprint ${version} from tool-cache`);
		return finalize(cachedBinary, true);
	}

	const binDir = join(installDir(), "bin", repository.cacheKey, target, tagKey);
	const binaryKey = `dprint-bin-${repository.cacheKey}+${target}-${tagKey}`;

	// Hosted runners get a fresh tool cache every job; actions/cache is what
	// actually persists the binary across runs.
	if (cacheEnabled) {
		const hitKey = await restoreCache([binDir], binaryKey);
		const restoredBinary = hitKey === undefined ? undefined : findBinary(binDir, ext);
		if (restoredBinary !== undefined) {
			info(`Cache hit: dprint ${version} from actions/cache`);
			return finalize(restoredBinary, true);
		}
	}

	info("Cache miss: downloading dprint");

	const zipPath = await downloadArchive(repository, version, target);
	const extractedDir = await extractZip(zipPath);
	const extractedBinary = findBinary(extractedDir, ext);
	if (extractedBinary === undefined) {
		throw new Error(`The archive has neither ${BINARY_NAMES.map(name => `${name}${ext}`).join(" nor ")}`);
	}

	if (platform() !== "win32") await exec("chmod", ["+x", extractedBinary]);

	// The binary under its own name, and as dprint too, which is what
	// workflows run (kprint's archives hold only kprint).
	await mkdirP(binDir);
	const binaryPath = join(binDir, basename(extractedBinary));
	await cp(extractedBinary, binaryPath);
	const dprintPath = join(binDir, `dprint${ext}`);
	if (dprintPath !== binaryPath) await cp(extractedBinary, dprintPath);

	// Populate the tool cache too, so self-hosted runners skip the download.
	if (cacheEnabled) await cacheDir(binDir, toolName, "0.0.0");

	if (cacheEnabled) {
		saveState("BIN_CACHE_KEY", binaryKey);
		saveState("BIN_CACHE_DIR", binDir);
	}

	return finalize(binaryPath, false);
}

/** The names a release's archives and binaries go by, preferred first: kjanat/kprint's
 * releases have `kprint-<target>.zip` (and `dprint-<target>.zip` for older installers),
 * upstream dprint's only `dprint-<target>.zip`. */
const BINARY_NAMES = ["kprint", "dprint"] as const;

/** Download the first archive the release has, by {@link BINARY_NAMES}.
 *
 * @param    repository  The repository the release is in.
 * @param    version     The release's exact tag.
 * @param    target      The Rust target triple the archive is built for.
 * @returns              Path to the downloaded archive.
 * @throws  {Error}      If the release has none of them.
 */
async function downloadArchive(repository: ReleaseRepository, version: string, target: string): Promise<string> {
	const releaseUrl = `https://github.com/${repository.name}/releases/download/${encodeURIComponent(version)}`;
	for (const name of BINARY_NAMES) {
		const url = `${releaseUrl}/${name}-${target}.zip`;
		info(`Downloading: ${url}`);
		try {
			return await downloadTool(url);
		} catch (error) {
			// not in this release: try the next name
			if (error instanceof HTTPError && error.httpStatusCode === 404) continue;
			throw error;
		}
	}
	const archives = BINARY_NAMES.map(name => `${name}-${target}.zip`).join(" nor ");
	throw new Error(`Release ${version} of ${repository.name} has neither ${archives}`);
}

/** The binary in a directory, by {@link BINARY_NAMES}.
 *
 * @param    dir  Directory to look in.
 * @param    ext  The platform's executable extension (`.exe` or empty).
 * @returns       Its path, or `undefined` if there is none.
 */
function findBinary(dir: string, ext: string): string | undefined {
	return BINARY_NAMES.map(name => join(dir, `${name}${ext}`)).find(path => existsSync(path));
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
