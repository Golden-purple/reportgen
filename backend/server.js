import app from "./app.js"
import { removeStaleJobContainers } from "./engineCaller.js"
import { removeStaleWorkspaces } from "./workspaceCleanup.js"
import { MAX_ACTIVE_JOBS } from "./jobLimiter.js"

// Entry point (also what deploy/reportgen-backend.service runs).
// app.js only builds the Express app; the side effects that must happen once per process live here.

try {
    const containers = await removeStaleJobContainers();
    const workspaces = await removeStaleWorkspaces();
    console.log(`Startup cleanup: removed ${containers} stale containers, ${workspaces} stale workspaces`);
} catch (error) {
    // Docker Desktop may not be running yet in development; report generation will fail
    // loudly later, but the server itself should still start.
    console.error("Startup cleanup failed:", error);
}

console.log(`Max active report jobs: ${MAX_ACTIVE_JOBS}`);
app.listen(3000);
