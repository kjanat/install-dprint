import { arch, platform } from "node:os";
import { execFileAsync } from "./exec.ts";

/** Target triples supported by dprint releases. Matches: {@link https://github.com/dprint/dprint/releases} */
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

/** Detect whether the Linux libc is musl (vs glibc).
 * @returns `true` if musl, `false` if glibc or not Linux.
 */
async function isMusl(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("ldd", ["--version"], { timeout: 5000 });
		// musl's ldd --version writes to stderr, but some versions write to stdout
		return stdout.toLowerCase().includes("musl");
	} catch (err: unknown) {
		// musl ldd exits non-zero on --version and prints to stderr
		if (
			err !== null && typeof err === "object" && "stderr" in err
			&& typeof (err as { stderr: unknown }).stderr === "string"
		) return (err as { stderr: string }).stderr.toLowerCase().includes("musl");
		return false;
	}
}

/** Resolve the dprint release target triple for the current platform.
 *
 * @param    p       The platform to resolve for (default: current).
 * @param    a       The architecture to resolve for (default: current).
 * @returns          The target triple string.
 * @throws  {Error}  If the platform is unsupported.
 */
export async function getTarget(p = platform(), a = arch()): Promise<Target> {
	if (p === "win32") return "x86_64-pc-windows-msvc";
	if (p === "darwin") return a === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
	if (p === "linux") {
		const musl = await isMusl();
		const suffix = musl ? "musl" : "gnu";
		if (a === "arm64") return `aarch64-unknown-linux-${suffix}`;
		if (a === "riscv64") return `riscv64-unknown-linux-${suffix}`;
		return `x86_64-unknown-linux-${suffix}`;
	}
	throw new Error(`Unsupported platform: ${p}-${a}`);
}
