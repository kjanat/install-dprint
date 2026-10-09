import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { PLUGIN_CACHE_ENVIRONMENT, parseRepository, resolvePluginCacheDirectory } from "../src/repository.ts";

describe("release repository", () => {
	test("defaults to the fork and normalizes GitHub casing", () => {
		expect(parseRepository().name).toBe("kjanat/dprint");
		expect(parseRepository(" ").name).toBe("kjanat/dprint");
		expect(parseRepository(" DPRINT/Dprint ")).toEqual(parseRepository("dprint/dprint"));
	});

	for (
		const input of [
			"dprint",
			"https://github.com/kjanat/dprint",
			"../dprint",
			"kjanat/../dprint",
			"kjanat/dprint?x=1",
			"kjanat/.",
		]
	) {
		test(`rejects invalid repository ${input}`, () => {
			expect(() => parseRepository(input)).toThrow("Expected owner/repo");
		});
	}

	test("does not collapse distinct repository names into one namespace", () => {
		expect(parseRepository("a-b/c").cacheKey).not.toBe(parseRepository("a/b-c").cacheKey);
		expect(parseRepository("a-b/c_d").cacheKey).not.toBe(parseRepository("a/b-c_d").cacheKey);
	});

	test("isolates sequential invocations without nesting and respects a changed cache root", () => {
		const root = join(import.meta.dir, "cache");
		const fork = resolvePluginCacheDirectory(parseRepository(), { DPRINT_CACHE_DIR: root });
		const inherited = {
			DPRINT_CACHE_DIR: fork.directory,
			[PLUGIN_CACHE_ENVIRONMENT.root]: fork.root,
			[PLUGIN_CACHE_ENVIRONMENT.path]: fork.directory,
		};
		expect(resolvePluginCacheDirectory(parseRepository(), inherited)).toEqual(fork);
		const upstream = resolvePluginCacheDirectory(parseRepository("dprint/dprint"), inherited);
		expect(upstream.root).toBe(root);
		expect(upstream.directory).toBe(join(root, "dprint_dprint"));
		expect(upstream.directory).not.toBe(fork.directory);
		const changed = resolvePluginCacheDirectory(parseRepository(), {
			...inherited,
			DPRINT_CACHE_DIR: join(root, "custom"),
		});
		expect(changed.directory).toBe(join(root, "custom", "kjanat_dprint"));
	});
});
