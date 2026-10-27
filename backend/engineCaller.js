import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
const ENGINE_TIMEOUT_MS = 20000;
const CONTAINER_TIMEOUT_SEC = 1;
const ENGINE_CPU_LIMIT = "1.0";
const ENGINE_MEMORY_LIMIT = "512m";
const ENGINE_PID_LIMIT = "64";
const ENGINE_TMPFS = "/tmp:rw,nosuid,nodev,exec,size=128m,mode=1777";
// C/C++ compilation uses TemporaryDirectory() to store executable in /tmp, so /tmp must be writable and executable.
// nodev -> no device files. exec -> the compiled program in /tmp may be executed. mode = 1777 -> temporary directory permissions.
// dockerArgs has --read-only which makes /app /usr /etc all read only. /tmp and /work are writable.
// /tmp is writable since we declare it with ENGINE_TMPFS. /work is writable since bind mount overlays a separate writable filesystem.
const ENGINE_FILE_SIZE_LIMIT = 16 * 1024 * 1024; // 16MB per file quota
const ENGINE_OPEN_FILES_LIMIT = 256; // Maximum 256 file descriptors

export class EngineTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Report generation exceeded ${timeoutMs / 1000} seconds.`);
        this.name = "EngineTimeoutError";
        this.timeoutMs = timeoutMs;
    }
}

export class EngineExitError extends Error {
    constructor(exitCode, signal) {
        super(`Docker command failed: exit code ${exitCode}, signal ${signal}`);
        this.name = "EngineExitError";
        this.exitCode = exitCode;
        this.signal = signal;
    }
}

// Must equal RENDER_FAILURE_EXIT_CODE in reportgen/constants.py.
// `docker run` exits with the container's exit code, so this arrives here unchanged.
export const RENDER_FAILURE_EXIT_CODE = 3;

function runDockerCommand(args) {
    return new Promise((resolve, reject) => {
        const child = spawn("docker", args, {
            stdio: "inherit"
        });

        child.once("error", (error) => {
            reject(error);
        });

        child.once("close", (code, signal) => {
            if (code === 0) {
                resolve();
            } 
            else {
                reject(new EngineExitError(code, signal));
            }
        });
    });
}

// Like runDockerCommand, but captures stdout (stderr still goes to the terminal) and resolves with it.
function readDockerOutput(args) {
    return new Promise((resolve, reject) => {
        const child = spawn("docker", args, {
            stdio: ["ignore", "pipe", "inherit"]
        });

        let output = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            output += chunk;
        });

        child.once("error", (error) => {
            reject(error);
        });

        child.once("close", (code, signal) => {
            if (code === 0) {
                resolve(output);
            }
            else {
                reject(new EngineExitError(code, signal));
            }
        });
    });
}

// Runs once at backend startup. A crash or restart loses the per-job timers,
// so containers from the previous process could otherwise run on or linger.
// Assumes exactly one backend process per Docker host (true for this deployment).
export async function removeStaleJobContainers() {
    const output = await readDockerOutput(["ps", "--all", "--quiet", "--filter", "name=reportgen-job-"]);
    const ids = output.split(/\s+/).filter((id) => id !== "");

    if (ids.length === 0) {
        return 0;
    }

    await runDockerCommand(["rm", "--force", ...ids]);
    return ids.length;
}

export async function runEngine(workspacePath) {
    const containerName = `reportgen-job-${randomUUID()}`;
    // function declared as async explicitly as async functions return promises.
    // to run multiple docker cli commands, need an awaitable way, essentially runEngine before returning, must call other promises.
    const mountArgument = `type=bind,source=${workspacePath},target=/work`;

    const dockerArgs = [
        "run", "--rm",
        "--name", containerName,

        "--cpus", ENGINE_CPU_LIMIT,
        "--memory", ENGINE_MEMORY_LIMIT, "--memory-swap", ENGINE_MEMORY_LIMIT,
        "--pids-limit", ENGINE_PID_LIMIT, "--init",
        "--network", "none",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges=true",
        "--read-only", 
        "--tmpfs", ENGINE_TMPFS,

        "--ulimit", `fsize=${ENGINE_FILE_SIZE_LIMIT}:${ENGINE_FILE_SIZE_LIMIT}`,
        "--ulimit", `nofile=${ENGINE_OPEN_FILES_LIMIT}:${ENGINE_OPEN_FILES_LIMIT}`,

        "--mount", mountArgument,
        "reportgen-engine:dev", "reportgen", "/work"
    ];

    const runPromise = runDockerCommand(dockerArgs);

    let timeoutId;
    const timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new EngineTimeoutError(ENGINE_TIMEOUT_MS));
        }, ENGINE_TIMEOUT_MS);
    });

    // we're doing a promise race between run and timeout promises here. whichever one settles first be adopted first by runEngine.
    try {
        await Promise.race([runPromise, timeoutPromise]);
    } 
    catch (error) {
        if (error instanceof EngineTimeoutError) {
            let stopError;
            try {
                await runDockerCommand([
                    "stop", "--timeout",
                    String(CONTAINER_TIMEOUT_SEC), containerName
                ]); // docker stop --timeout 1: cli asks docker daemon to return SIGTERM, waits for 1s. If no response, use SIGKILL.
            } 
            catch (cleanupError) {
                stopError = cleanupError;
            }

            await runPromise.catch(() => {});
            if (stopError) {
                throw new AggregateError([error, stopError], "Report timed out and Container stopping/cleanup failed.");
            }
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutId);
    }
}