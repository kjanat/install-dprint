import * as core from "@actions/core";

async function post(): Promise<void> {
	try {
		core.info("install-dprint: post cleanup");
		// TODO: implement plugin cache save
	} catch (error) {
		if (error instanceof Error) {
			core.warning(error.message);
		} else {
			core.warning(String(error));
		}
	}
}

void post();
