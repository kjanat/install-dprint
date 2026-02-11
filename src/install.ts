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

	const binDir = path.join(installDir(), "bin");
	const ext = os.platform() === "win32" ? ".exe" : "";
	const binaryPath = path.join(binDir, `dprint${ext}`);

	// Download the zip archive
	const url = `https://github.com/dprint/dprint/releases/download/${version}/dprint-${target}.zip`;
	core.info(`Downloading: ${url}`);

	const zipPath = await tc.downloadTool(url);
	const extractedDir = await tc.extractZip(zipPath);

	// Move extracted binary to install dir
	await io.mkdirP(binDir);

	const extractedBinary = path.join(extractedDir, `dprint${ext}`);
	await io.cp(extractedBinary, binaryPath, { force: true });

	// chmod +x on non-Windows
	if (os.platform() !== "win32") {
		await exec.exec("chmod", ["+x", binaryPath]);
	}

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

	// Add to PATH
	core.addPath(binDir);

	// Set outputs
	core.setOutput("version", actualVersion);
	core.setOutput("location", binaryPath);

	core.info(`dprint ${actualVersion} installed at ${binaryPath}`);

	return { version: actualVersion, location: binaryPath };
}
