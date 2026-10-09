import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeCacheKey, findConfigFiles } from "../src/config.ts";
import { parseRepository } from "../src/repository.ts";

const roots: string[] = [];
const previousWorkspace = process.env["GITHUB_WORKSPACE"];
afterEach(async () => {
	if (previousWorkspace === undefined) delete process.env["GITHUB_WORKSPACE"];
	else process.env["GITHUB_WORKSPACE"] = previousWorkspace;
	await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

test("discovers all six config names in the fork's root priority order", async () => {
	const root = await mkdtemp(join(tmpdir(), "install-dprint-config-"));
	roots.push(root);
	process.env["GITHUB_WORKSPACE"] = root;
	const names = ["dprint.json", "dprint.jsonc", ".dprint.json", ".dprint.jsonc", "dprint.toml", ".dprint.toml"];
	for (const name of names) await writeFile(join(root, name), name.endsWith(".toml") ? "plugins = []" : "{}");
	for (const name of names) {
		expect((await findConfigFiles())[0]).toBe(join(root, name));
		await rm(join(root, name));
	}
});

test("plugin primary and fallback keys cannot restore another repository's cache", () => {
	const fork = computeCacheKey([], "0.56.1", parseRepository());
	const upstream = computeCacheKey([], "0.56.1", parseRepository("dprint/dprint"));
	const sameFork = computeCacheKey([], "0.56.1", parseRepository("KJANAT/DPRINT"));
	expect(sameFork).toEqual(fork);
	expect(fork.primaryKey).not.toBe(upstream.primaryKey);
	for (const key of fork.restoreKeys) expect(upstream.primaryKey.startsWith(key)).toBe(false);
	for (const key of upstream.restoreKeys) expect(fork.primaryKey.startsWith(key)).toBe(false);
});
