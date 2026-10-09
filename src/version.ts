import { HttpClient } from "@actions/http-client";
import { parseRepository, type ReleaseRepository } from "./repository.ts";

interface ReleaseClient {
	get(url: string): Promise<{ message: { headers: { location?: string } } }>;
}

/** Resolve a version input to an actual version tag.
 *
 * - If input is "latest" (or empty), queries the GitHub API for the latest release tag.
 * - Otherwise, returns the input as-is (assumed to be a valid version string).
 *
 * @param   input    Version input string (e.g. `"latest"` or `"0.55.2"`).
 * @returns          Resolved version string like `"0.55.2"`.
 * @throws  {Error}  If the latest version cannot be resolved from GitHub.
 */
export async function resolveVersion(
	input: string,
	repository: ReleaseRepository = parseRepository(),
	http: ReleaseClient = new HttpClient("install-dprint-action", [], { allowRedirects: false }),
): Promise<string> {
	const trimmed = input.trim();
	if (trimmed !== "" && trimmed.toLowerCase() !== "latest") return trimmed;

	/** GitHub redirects `/releases/latest` to `/releases/tag/<version>`.
	 * Follow the redirect to extract the tag name without downloading anything. */
	const releaseUrl = `https://github.com/${repository.name}/releases`;
	const response = await http.get(`${releaseUrl}/latest`);

	const location = response.message.headers.location;
	if (typeof location !== "string" || location.length === 0) {
		throw new Error("Failed to resolve latest dprint version: no redirect from GitHub releases");
	}

	const tagPrefix = `${releaseUrl}/tag/`;
	if (location.slice(0, tagPrefix.length).toLowerCase() !== tagPrefix || location.length === tagPrefix.length) {
		throw new Error(`Failed to parse version tag from redirect: ${location}`);
	}
	return decodeURIComponent(location.slice(tagPrefix.length));
}
