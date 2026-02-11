import * as path from "node:path";
import * as os from "node:os";
import * as core from "@actions/core";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";
import * as exec from "@actions/exec";
import { getTarget } from "./platform.js";
import { resolveVersion } from "./version.js";

/** Where dprint installs to by default. */
function installDir(): string {
	return (
		process.env["DPRINT_INSTALL"] ??
		path.join(os.homedir(), ".dprint")
	);
}

/** Download, extract, and install the dprint binary. Returns path to binary. */
export async function installDprint(versionInput: string): Promise<{
	version: string;
	location: string;
}> {
	const version = await resolveVersion(versionInput);
	core.info(`Resolved dprint version: ${version}`);

	const target = await getTarget();
	core.info(`Detected platform target: ${target}`);

	const ext = os.platform() === "win32" ? ".exe" : "";

	// Check tool-cache first
	const cachedDir = tc.find("dprint", version);
	if (cachedDir) {
		core.info(`Cache hit: dprint ${version} from tool-cache`);
		const binaryPath = path.join(cachedDir, `dprint${ext}`);
		return finalize(binaryPath, version);
	}

	core.info("Cache miss: downloading dprint");

	// Download the zip archive
	const url = `https://github.com/dprint/dprint/releases/download/${version}/dprint-${target}.zip`;
	core.info(`Downloading: ${url}`);

	const zipPath = await tc.downloadTool(url);
	const extractedDir = await tc.extractZip(zipPath);

	// chmod +x on non-Windows
	if (os.platform() !== "win32") {
		await exec.exec("chmod", ["+x", path.join(extractedDir, `dprint${ext}`)]);
	}

	// Cache the extracted directory for future runs
	const toolDir = await tc.cacheDir(extractedDir, "dprint", version);
	const binaryPath = path.join(toolDir, `dprint${ext}`);

	return finalize(binaryPath, version);
}

/** Add to PATH, set outputs, verify binary works. */
async function finalize(
	binaryPath: string,
	resolvedVersion: string,
): Promise<{ version: string; location: string }> {
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

	core.info(`dprint ${actualVersion} ready at ${binaryPath}`);

	return { version: actualVersion, location: binaryPath };
}
