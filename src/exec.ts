import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Promisified version of {@linkcode execFile}. */
export const execFileAsync = promisify(execFile);
