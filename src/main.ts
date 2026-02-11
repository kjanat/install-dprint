import * as core from "@actions/core";

async function run(): Promise<void> {
	try {
		core.info("install-dprint: starting");
		// TODO: implement install logic
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed(String(error));
		}
	}
}

void run();
