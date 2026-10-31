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

	test("follows a renamed repository to its latest release", async () => {
		const requests: string[] = [];
		const locations: Record<string, string> = {
			"https://github.com/kjanat/dprint/releases/latest": "https://github.com/kjanat/kprint/releases/latest",
			"https://github.com/kjanat/kprint/releases/latest": "https://github.com/kjanat/kprint/releases/tag/0.60.6-kjanat",
		};
		const http = {
			get: async (url: string) => {
				requests.push(url);
				return { message: { headers: { location: locations[url] } } };
			},
		};
		expect(await resolveVersion("latest", parseRepository("kjanat/dprint"), http)).toBe("0.60.6-kjanat");
		expect(requests).toEqual(Object.keys(locations));
	});

	test("rejects a renamed repository's tag that is still the old name's", async () => {
		const locations: Record<string, string> = {
			"https://github.com/kjanat/dprint/releases/latest": "https://github.com/kjanat/kprint/releases/latest",
			"https://github.com/kjanat/kprint/releases/latest": "https://github.com/kjanat/dprint/releases/tag/0.60.6-kjanat",
		};
		const http = { get: async (url: string) => ({ message: { headers: { location: locations[url] } } }) };
		await expect(resolveVersion("latest", parseRepository("kjanat/dprint"), http)).rejects.toThrow(
			"Failed to parse version tag",
		);
	});

	test("stops following renames that go in circles", async () => {
		const http = {
			get: async (url: string) => ({
				message: {
					headers: {
						location: url.includes("/a/")
							? "https://github.com/kjanat/b/releases/latest"
							: "https://github.com/kjanat/a/releases/latest",
					},
				},
			}),
		};
		await expect(resolveVersion("latest", parseRepository("kjanat/a"), http)).rejects.toThrow("repository renames");
	});

	test("rejects redirects outside the selected repository", async () => {
		const http = {
			get: async () => ({ message: { headers: { location: "https://github.com/dprint/dprint/releases/tag/0.56.1" } } }),
		};
		await expect(resolveVersion("latest", parseRepository(), http)).rejects.toThrow("Failed to parse version tag");
	});
});
