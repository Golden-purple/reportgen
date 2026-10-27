import { readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Runs once at backend startup. If Node crashed mid-job, `await using` never got to dispose
// the workspace, so its reportgen-* directory would stay in the temp dir forever.
// Only direct children of os.tmpdir() with the "reportgen-" prefix are touched.
// Assumes exactly one backend process per host (true for this deployment); a second
// instance's live workspaces would look stale to this one.
export async function removeStaleWorkspaces() {
    const tmpRoot = os.tmpdir();
    const entries = await readdir(tmpRoot, { withFileTypes: true });

    let removed = 0;
    for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("reportgen-")) {
            await rm(path.join(tmpRoot, entry.name), { recursive: true, force: true });
            removed++;
        }
    }
    return removed;
}
