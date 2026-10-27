// In-process admission control: at most MAX_ACTIVE_JOBS engine containers per backend process.
// Per-container limits bound one job; this bounds how many run at once on the host.
// Single-process only: several backend instances would each allow MAX_ACTIVE_JOBS.

function readMaxActiveJobs() {
    const raw = process.env.REPORTGEN_MAX_ACTIVE_JOBS ?? "2";
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`REPORTGEN_MAX_ACTIVE_JOBS must be a positive integer, got "${raw}"`);
    }
    return value;
}

export const MAX_ACTIVE_JOBS = readMaxActiveJobs();

let activeJobs = 0;

export function getActiveJobCount() {
    return activeJobs;
}

// Returns a release function, or null when every slot is taken.
// The release function is idempotent so a double call can never push the count below the truth.
export function tryAcquireJobSlot() {
    if (activeJobs >= MAX_ACTIVE_JOBS) {
        return null;
    }
    activeJobs++;
    let released = false;
    return function releaseJobSlot() {
        if (released) return;
        released = true;
        activeJobs--;
    };
}
