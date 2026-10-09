import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import action from "../action.yml" with { type: "yaml" };

const root = dirname(import.meta.dir);
const files = await readdir(join(root, "dist"), { withFileTypes: true });
const phases = ["pre", "main", "post"] as const;
const actualFiles = files.map(file => file.name);

function entrypointFor(phase: typeof phases[number]): string | undefined {
	const entrypoint: unknown = action.runs[phase];
	return typeof entrypoint === "string" ? entrypoint : undefined;
}

describe("action metadata", () => {
	test("defaults to the fork's releases", () => {
		expect(action.inputs.repository.default).toBe("kjanat/dprint");
	});
	test("enables plugin caching and disables binary caching by default", () => {
		expect(action.inputs.cache.default).toBe("true");
		expect(action.inputs["cache-binary"].default).toBe("false");
	});
	test("uses Node.js 24", () => {
		expect(action.runs.using).toBe("node24");
	});
});

describe("action entrypoints", () => {
	for (const phase of phases) {
		const entrypoint = entrypointFor(phase) ?? "";
		test.skipIf(entrypoint === "")(`${phase} exists in dist`, () => {
			expect(dirname(entrypoint)).toBe("dist");
			expect(actualFiles).toContain(basename(entrypoint));
		});
	}

	test("dist contains only configured entrypoints", () => {
		const expectedFiles = phases.flatMap(phase => {
			const entrypoint = entrypointFor(phase);
			return entrypoint === undefined ? [] : [basename(entrypoint)];
		});
		expect(actualFiles.toSorted()).toEqual(expectedFiles.toSorted());
	});
});
