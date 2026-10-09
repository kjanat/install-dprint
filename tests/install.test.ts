import { afterAll, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import * as actionsCache from "@actions/cache";
import * as core from "@actions/core";
import type { ExecOptions } from "@actions/exec";
import * as actionsExec from "@actions/exec";
import * as toolCache from "@actions/tool-cache";
import { getTarget } from "../src/platform.ts";
import { parseRepository } from "../src/repository.ts";

const root = await mkdtemp(join(tmpdir(), "install-dprint-test-"));
const extracted = join(root, "extracted");
const binaryName = platform() === "win32" ? "dprint.exe" : "dprint";
await mkdir(extracted);
await writeFile(join(extracted, binaryName), "test binary");
const previousEnvironment = new Map<string, string | undefined>();
for (
	const [name, value] of Object.entries({
		RUNNER_TOOL_CACHE: join(root, "tool-cache"),
		DPRINT_INSTALL: join(root, "install"),
		DPRINT_CACHE_DIR: join(root, "plugins"),
	})
) {
	previousEnvironment.set(name, process.env[name]);
	process.env[name] = value;
}

for (const name of ["DPRINT_ACTION_CACHE_ROOT", "DPRINT_ACTION_CACHE_PATH"]) {
	previousEnvironment.set(name, process.env[name]);
}

afterAll(async () => {
	for (const [name, value] of previousEnvironment) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	await rm(root, { recursive: true, force: true });
	mock.restore();
});

const downloads: string[] = [];
const binaryKeys: string[] = [];
mock.module("@actions/core", () => ({
	...core,
	addPath: () => {},
	info: () => {},
	debug: () => {},
	saveState: () => {},
	setOutput: () => {},
}));
mock.module("@actions/cache", () => ({
	...actionsCache,
	restoreCache: async (_paths: string[], key: string) => {
		binaryKeys.push(key);
		return undefined;
	},
}));
mock.module("@actions/exec", () => ({
	...actionsExec,
	exec: async (_command: string, args: string[], options?: ExecOptions) => {
		if (args[0] === "--version") options?.listeners?.stdout?.(Buffer.from("dprint 0.56.1\n"));
		return 0;
	},
}));
mock.module("@actions/tool-cache", () => ({
	...toolCache,
	downloadTool: async (url: string) => {
		downloads.push(url);
		return join(root, "archive.zip");
	},
	extractZip: async () => extracted,
}));

const { installDprint } = await import("../src/install.ts");

test("installs each repository and exact tag independently, then reuses its own tool-cache", async () => {
	const tag = "v0.56.1-fork.1";
	const target = await getTarget();
	const fork = await installDprint(tag, true);
	const upstream = await installDprint(tag, true, parseRepository("dprint/dprint"));
	const caseTag = await installDprint(tag.toUpperCase(), true);
	const slashTag = await installDprint("fork/preview+1", true);
	expect(fork.cacheHit).toBe(false);
	expect(upstream.cacheHit).toBe(false);
	expect(caseTag.cacheHit).toBe(false);
	expect(slashTag.cacheHit).toBe(false);
	expect(new Set([fork.location, upstream.location, caseTag.location, slashTag.location]).size).toBe(4);
	expect(downloads).toEqual([
		`https://github.com/kjanat/dprint/releases/download/${tag}/dprint-${target}.zip`,
		`https://github.com/dprint/dprint/releases/download/${tag}/dprint-${target}.zip`,
		`https://github.com/kjanat/dprint/releases/download/${tag.toUpperCase()}/dprint-${target}.zip`,
		`https://github.com/kjanat/dprint/releases/download/fork%2Fpreview%2B1/dprint-${target}.zip`,
	]);
	expect(new Set(binaryKeys).size).toBe(4);
	for (
		const { repository, requested } of [
			{ repository: "kjanat/dprint", requested: tag },
			{ repository: "dprint/dprint", requested: tag },
			{ repository: "kjanat/dprint", requested: tag.toUpperCase() },
			{ repository: "kjanat/dprint", requested: "fork/preview+1" },
		]
	) {
		const cached = await installDprint(requested, true, parseRepository(repository));
		expect(cached.cacheHit).toBe(true);
		expect(await readFile(cached.location, "utf8")).toBe("test binary");
	}
	expect(downloads.length).toBe(4);
	const uncached = await installDprint(tag, false);
	expect(uncached.cacheHit).toBe(false);
	expect(downloads.length).toBe(5);
});

test("main controls plugin and binary cache operations independently", async () => {
	const configPath = join(root, "dprint.toml");
	await writeFile(configPath, "plugins = []");
	const inputs: Record<string, string> = { cache: "false", "config-path": configPath };
	const installations: boolean[] = [];
	const restores: string[] = [];
	const warmups: string[] = [];
	const outputs = new Map<string, unknown>();
	mock.module("@actions/core", () => ({
		...core,
		getInput: (name: string) => inputs[name] ?? "",
		info: () => {},
		debug: () => {},
		exportVariable: (name: string, value: string) => {
			process.env[name] = value;
		},
		saveState: () => {},
		setOutput: (name: string, value: unknown) => {
			outputs.set(name, value);
		},
		setFailed: (message: string) => {
			throw new Error(message);
		},
	}));
	mock.module("@actions/cache", () => ({
		...actionsCache,
		restoreCache: async (_paths: string[], key: string) => {
			restores.push(key);
			return undefined;
		},
	}));
	mock.module("../src/install.ts", () => ({
		installDprint: async (_version: string, binaryCache: boolean) => {
			installations.push(binaryCache);
			return { version: "0.56.1", location: join(extracted, binaryName), cacheHit: false };
		},
	}));
	mock.module("../src/warmup.ts", () => ({
		warmupPlugins: async (path: string) => {
			warmups.push(path);
		},
	}));
	const { run } = await import("../src/main.ts");
	await run(); // Drain the entrypoint's automatic invocation before checking each case.
	for (
		const { plugin, binary, expectedPlugin, expectedBinary } of [
			{ plugin: "", binary: "", expectedPlugin: true, expectedBinary: false },
			{ plugin: "true", binary: "false", expectedPlugin: true, expectedBinary: false },
			{ plugin: "false", binary: "false", expectedPlugin: false, expectedBinary: false },
			{ plugin: "false", binary: "true", expectedPlugin: false, expectedBinary: true },
			{ plugin: "true", binary: "true", expectedPlugin: true, expectedBinary: true },
		]
	) {
		inputs.cache = plugin;
		inputs["cache-binary"] = binary;
		installations.length = 0;
		restores.length = 0;
		warmups.length = 0;
		outputs.clear();
		await run();
		expect(installations).toEqual([expectedBinary]);
		expect(restores.length).toBe(expectedPlugin ? 1 : 0);
		expect(warmups.length).toBe(expectedPlugin ? 1 : 0);
		expect(outputs.get("plugin-cache-hit")).toBe(false);
		expect(outputs.get("plugin-cache-key")).toEqual(
			expectedPlugin ? expect.stringContaining("dprint-plugins-kjanat_dprint+") : "",
		);
	}
});
