import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
const ENGINE_TIMEOUT_MS = 20000;
const CONTAINER_TIMEOUT_SEC = 1;

export class EngineTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Report generation exceeded ${timeoutMs / 1000} seconds.`);
        this.name = "EngineTimeoutError";
        this.timeoutMs = timeoutMs;
    }
}

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
                reject(new Error(`Docker command failed: exit code ${code}, signal ${signal}`));
            }
        });
    });
}

export async function runEngine(workspacePath) {
    const containerName = `reportgen-job-${randomUUID()}`;
    // function declared as async explicitly as async functions return promises.
    // to run multiple docker cli commands, need an awaitable way, essentially runEngine before returning, must call other promises.
    const mountArgument = `type=bind,source=${workspacePath},target=/work`;

    const dockerArgs = [
        "run", "--rm",
        "--name", containerName,
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