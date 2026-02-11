import { HttpClient } from "@actions/http-client";

/**
 * Resolve a version input to an actual version tag.
 *
 * - If input is "latest" (or empty), queries the GitHub API for the latest
 *   release tag.
 * - Otherwise, returns the input as-is (assumed to be a valid version string).
 *
 * Returns a version string like "0.51.1" (no "v" prefix — dprint releases
 * don't use one).
 */
export async function resolveVersion(input: string): Promise<string> {
	const trimmed = input.trim();
	if (trimmed !== "" && trimmed.toLowerCase() !== "latest") {
		return trimmed;
	}

	const http = new HttpClient("install-dprint-action", [], {
		allowRedirects: false,
	});

	// GitHub redirects /releases/latest to /releases/tag/<version>.
	// Follow the redirect to extract the tag name without downloading anything.
	const response = await http.get(
		"https://github.com/dprint/dprint/releases/latest",
	);

	const location = response.message.headers.location;
	if (typeof location !== "string" || location.length === 0) {
		throw new Error(
			"Failed to resolve latest dprint version: no redirect from GitHub releases",
		);
	}

	// Location: https://github.com/dprint/dprint/releases/tag/0.48.0
	const tag = location.split("/").pop();
	if (tag === undefined || tag.length === 0) {
		throw new Error(
			`Failed to parse version tag from redirect: ${location}`,
		);
	}

	return tag;
}
