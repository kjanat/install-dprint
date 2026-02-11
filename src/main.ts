import * as core from "@actions/core";
import { installDprint } from "./install.js";

async function run(): Promise<void> {
	try {
		const versionInput = core.getInput("version") || "latest";

		const { version, location } = await installDprint(versionInput);

		core.info(`dprint ${version} ready at ${location}`);
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed(String(error));
		}
	}
}

void run();
