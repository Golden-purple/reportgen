// Prometheus metrics for service usage and health, served at GET /metrics by server.js.
// Prometheus scrapes that endpoint every 15 s and stores the time series; Grafana only queries it.
// Label rule: every distinct label value is a new time series kept in Prometheus memory forever,
// so labels come from the closed sets below. Never use filenames, code, UUIDs, paths or IPs.

import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from "prom-client";
import { EngineTimeoutError, EngineExitError, RENDER_FAILURE_EXIT_CODE } from "./engineCaller.js";
import { MAX_ACTIVE_JOBS, getActiveJobCount } from "./jobLimiter.js";

export const register = new Registry();
collectDefaultMetrics({ register });

const JOB_OUTCOMES = ["success", "timeout", "render_failed", "busy", "error"];
const TIMED_OUTCOMES = ["success", "timeout", "render_failed", "error"]; // busy jobs never start, so no duration
const LANGUAGES = ["python", "c", "cpp"];
const REJECTION_REASONS = [
    "no_files", "unsupported_extension", "empty_file",
    "file_too_large", "too_many_files", "unexpected_field", "invalid_upload"
];

export const jobsTotal = new Counter({
    name: "reportgen_jobs_total",
    help: "Uploads that passed validation, by final outcome (busy = rejected by the limiter, never started).",
    labelNames: ["outcome"],
    registers: [register]
});

export const jobDurationSeconds = new Histogram({
    name: "reportgen_job_duration_seconds",
    help: "Wall time from job slot acquisition to the end of workspace cleanup, by outcome.",
    labelNames: ["outcome"],
    buckets: [0.5, 1, 2, 3, 4, 5, 7.5, 10, 12.5, 15, 20, 25],
    registers: [register]
});

// Read from the limiter at scrape time so the gauge can never drift from the real count.
new Gauge({
    name: "reportgen_active_jobs",
    help: "Engine jobs running right now.",
    registers: [register],
    collect() {
        this.set(getActiveJobCount());
    }
});

new Gauge({
    name: "reportgen_max_active_jobs",
    help: "Configured limit on concurrent engine jobs (capacity line for dashboards).",
    registers: [register]
}).set(MAX_ACTIVE_JOBS);

export const uploadedFilesTotal = new Counter({
    name: "reportgen_uploaded_files_total",
    help: "Files in admitted jobs, by language.",
    labelNames: ["language"],
    registers: [register]
});

export const uploadRejectionsTotal = new Counter({
    name: "reportgen_upload_rejections_total",
    help: "Requests rejected by validation or Multer, by reason.",
    labelNames: ["reason"],
    registers: [register]
});

// Without a starting 0 a series does not exist until its first event: Grafana shows "No data"
// and rate() misses the first increment.
for (const outcome of JOB_OUTCOMES) jobsTotal.inc({ outcome }, 0);
for (const outcome of TIMED_OUTCOMES) jobDurationSeconds.zero({ outcome });
for (const language of LANGUAGES) uploadedFilesTotal.inc({ language }, 0);
for (const reason of REJECTION_REASONS) uploadRejectionsTotal.inc({ reason }, 0);

export function languageForExtension(ext) {
    if (ext === ".py") return "python";
    if (ext === ".c") return "c";
    return "cpp";
}

export function classifyJobError(err) {
    if (err instanceof EngineTimeoutError) return "timeout";
    // A timeout whose follow-up `docker stop` also failed arrives as an AggregateError with the timeout first.
    if (err instanceof AggregateError && err.errors[0] instanceof EngineTimeoutError) return "timeout";
    if (err instanceof EngineExitError && err.exitCode === RENDER_FAILURE_EXIT_CODE) return "render_failed";
    return "error";
}
