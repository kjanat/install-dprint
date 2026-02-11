import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

/**
 * Target triples supported by dprint releases.
 * Matches: https://github.com/dprint/dprint/releases
 */
type Target =
	| "x86_64-apple-darwin"
	| "aarch64-apple-darwin"
	| "x86_64-unknown-linux-gnu"
	| "aarch64-unknown-linux-gnu"
	| "x86_64-unknown-linux-musl"
	| "aarch64-unknown-linux-musl"
	| "riscv64-unknown-linux-gnu"
	| "riscv64-unknown-linux-musl"
	| "x86_64-pc-windows-msvc";

/** Detect whether the Linux libc is musl (vs glibc). */
async function isMusl(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("ldd", ["--version"], {
			timeout: 5000,
		});
		// musl's ldd --version writes to stderr, but some versions write to stdout
		return stdout.toLowerCase().includes("musl");
	} catch (err: unknown) {
		// musl ldd exits non-zero on --version and prints to stderr
		if (
			err !== null &&
			typeof err === "object" &&
			"stderr" in err &&
			typeof (err as { stderr: unknown }).stderr === "string"
		) {
			return (err as { stderr: string }).stderr.toLowerCase().includes("musl");
		}
		return false;
	}
}

/** Resolve the dprint release target triple for the current platform. */
export async function getTarget(): Promise<Target> {
	const platform = os.platform();
	const arch = os.arch();

	if (platform === "win32") {
		return "x86_64-pc-windows-msvc";
	}

	if (platform === "darwin") {
		return arch === "arm64"
			? "aarch64-apple-darwin"
			: "x86_64-apple-darwin";
	}

	if (platform === "linux") {
		const musl = await isMusl();
		const suffix = musl ? "musl" : "gnu";

		if (arch === "arm64") {
			return `aarch64-unknown-linux-${suffix}`;
		}
		if (arch === "riscv64") {
			return `riscv64-unknown-linux-${suffix}`;
		}
		return `x86_64-unknown-linux-${suffix}`;
	}

	throw new Error(`Unsupported platform: ${platform}-${arch}`);
}
