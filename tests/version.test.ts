import { describe, expect, test } from "bun:test";
import { parseRepository } from "../src/repository.ts";
import { resolveVersion } from "../src/version.ts";

describe("release version", () => {
	for (const name of ["kjanat/dprint", "dprint/dprint"]) {
		test(`resolves latest from ${name} and decodes the exact tag`, async () => {
			const requests: string[] = [];
			const http = {
				get: async (url: string) => {
					requests.push(url);
					return { message: { headers: { location: `https://github.com/${name}/releases/tag/fork%2Fpreview%2B1` } } };
				},
			};
			expect(await resolveVersion("latest", parseRepository(name), http)).toBe("fork/preview+1");
			expect(requests).toEqual([`https://github.com/${name}/releases/latest`]);
		});
	}

	test("preserves explicit tags without querying latest", async () => {
		const http = {
			get: async () => {
				throw new Error("Unexpected request");
			},
		};
		for (const tag of ["v0.56.1-fork.1", "fork/preview+1"]) {
			expect(await resolveVersion(tag, parseRepository(), http)).toBe(tag);
		}
	});

	test("rejects redirects outside the selected repository", async () => {
		const http = {
			get: async () => ({ message: { headers: { location: "https://github.com/dprint/dprint/releases/tag/0.56.1" } } }),
		};
		await expect(resolveVersion("latest", parseRepository(), http)).rejects.toThrow("Failed to parse version tag");
	});
});
