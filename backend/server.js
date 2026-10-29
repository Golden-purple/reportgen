import express from "express"
import multer from "multer"
import path from "node:path"
import { mkdtempDisposable, writeFile, readFile, chmod } from "node:fs/promises"
import os from "node:os"
import { EngineTimeoutError, EngineExitError, RENDER_FAILURE_EXIT_CODE, runEngine, removeStaleJobContainers } from "./engineCaller.js"
import { MAX_ACTIVE_JOBS, tryAcquireJobSlot } from "./jobLimiter.js"
import { removeStaleWorkspaces } from "./workspaceCleanup.js"
import { register, jobsTotal, jobDurationSeconds, uploadedFilesTotal, uploadRejectionsTotal, classifyJobError, languageForExtension } from "./metrics.js"

const app = express();   
app.use(express.json());

const allowedExt = new Set([".py", ".cpp", ".c"]);

const uploadConfig = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 7, fileSize: 1024*1024
    }
});

app.use((req, res, next) => {
    if (req.path === "/metrics") {
        // Prometheus scrapes every 15 s; logging each one would flood the console.
        return next();
    }
    console.log(`${req.method} ${req.url}`.toUpperCase());
    next();
    console.log("Request passed through logging middleware");
});

app.get("/", (req, res) => {
    res.status(200).send("reportgen backend");
});

app.get("/api/health", (req, res) => {
    res.status(200).send("OK");
});

// /metrics is unauthenticated. In development it is reachable on port 3000.
// Feature 3 (deployment) makes sure the reverse proxy forwards only /api/*, so /metrics is never public.
app.get("/metrics", async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.send(await register.metrics());
});

// app.post("/api/test", (req, res) => {
//     console.log(req.body.hello);
//     res.status(200).send("received something from client");
// });

app.post("/api/upload", uploadConfig.array("files", 7), async (req, res) => { 
    // the handler is async since mkdtmp returns a promise. Use await... (mkdtmp function) here, so the handler is to be async
    if(!req.files || req.files.length === 0){
        uploadRejectionsTotal.inc({ reason: "no_files" });
        return res.status(400).json({
            message: "Upload a minimum of 1 file"
        });
    }
    
    // POST api does the file extension validation directly. 
    // Error handling for size/count mismatch is necessary since 
    // api won't even get to access the files uploaded if the size > 1mb or if > 7 files are uploaded. 
    // Hence use Express err handler. 

    for(const file of req.files){
        const extension = path.extname(file.originalname).toLowerCase();
        if(!allowedExt.has(extension)){
            uploadRejectionsTotal.inc({ reason: "unsupported_extension" });
            return res.status(422).json({
                message: "Only Python, C and C++ files are supported",
                file: file.originalname
            });
        }
        if(file.size === 0){
            uploadRejectionsTotal.inc({ reason: "empty_file" });
            return res.status(422).json({
                message: "Uploaded file can't be empty",
                file: file.originalname
            });
        }
    }

    const releaseJobSlot = tryAcquireJobSlot();
    if (!releaseJobSlot) {
        jobsTotal.inc({ outcome: "busy" });
        res.set("Retry-After", "5");
        return res.status(503).json({
            message: "The server is busy generating other reports. Please try again in a few seconds.",
            code: "ENGINE_BUSY"
        });
    }

    for (const file of req.files) {
        uploadedFilesTotal.inc({ language: languageForExtension(path.extname(file.originalname).toLowerCase()) });
    }
    const endJobTimer = jobDurationSeconds.startTimer();
    let outcome = "error";

    let workspacePath, pdfBuffer;
    try {
      {
        await using workDir = await mkdtempDisposable(
            // `await using` essentially makes the cleanup automatic after usage.
            // kinda like a garbage collector but exactly after scope finishes.
            path.join(os.tmpdir(), "reportgen-")

            // await mkdtempDisposable... since the directory creation may take time, to get the directory.
            // await using workDir... automatic cleanup after local scope exits.

            // workDir object has: .path, .remove(), workDir[Symbol.asyncDispose] which is called on scope exit.
        );

        workspacePath = workDir.path;

        // mkdtemp creates the directory as 0700. The engine container runs as UID 10001, not as
        // the backend's user, so on Linux it could not list the inputs or write work.pdf.
        // Docker Desktop on Windows ignores these modes, which is why this only shows up on Linux.
        await chmod(workspacePath, 0o777);

        // console.log("Workspace created for this request:", workspacePath);
        
        const writePromises = req.files.map(async (file, index) => {
            const extension = path.extname(file.originalname).toLowerCase();
            const finalName = `input-${index}${extension}`;
            const destination = path.join(workspacePath, finalName);
            
            await writeFile(destination, file.buffer);
            console.log(`Saved ${file.originalname} in ${destination}`);

            // await writeFile() so each write is asynchronous to (unique) files.
            // async (file, index) so the different parts of the handler (getting destination, writing) can throw
            // errors independently.

            // Essentially, 
            // async (file, index) so when callback is done for first file (it enters writeFile state), and 
            // then starts asynchronously executing callback for second file while waiting on first file's promise.
            
            // await writeFile() since writeFile returns a Promise.

        });

        // could run a for..of loop and write each file serially, each file write itself will be async, but 
        // writeFile(file(i+1)) will begin only after writeFile(file(i)), making the overall execution serial. 
        // await Promise.allSettled( Array of promises ) removes this serialism issue, .map() runs concurrently on all elements.

        const results = await Promise.allSettled(writePromises);
        const failedWrite = results.find(
            result => (result.status === "rejected")
        );

        // Difference between Promise.all() and Promise.allSettled():
        // .all() is all-or-nothing, if one of the promises fail the entire returned promise is rejected without knowing which one failed.
        // .allSettled() waits for all the promises to get resolved, tells what happened in each promise, returns an array of values.
        // .allSettled() used for independent tasks where we want each promise's detail. 
        
        // .allSettled() to ensure writeFile() doesn't write to an invalid directory 
        // since .all() exits and mkdtemp will be cleaned prematurely.

        // Promise.all(): fulfills if all succeed; rejects on the first observed rejection. 
        // Other operations continue; nothing is rolled back.
        // Promise.allSettled(): waits for every outcome and returns
        // status/value or status/reason records.
        // We inspect those records and throw if any write failed. Waiting for all writes to settle prevents 
        // scope exit premature cleanup from removing the workspace while writes are still running during .all().
        
        // Performance on Success is the same. Performance on failure slightly varies.

        if (failedWrite) {
            throw failedWrite.reason;
        }

        // console.log("All uploaded files were written to disk successfully");
        await runEngine(workspacePath);
        pdfBuffer = await readFile( path.join(workspacePath, "work.pdf") );

      }
      // Set after the block exits so workspace cleanup time counts and a cleanup failure is an error.
      outcome = "success";
    }
    catch (err) {
        outcome = classifyJobError(err);
        throw err;
    }
    finally {
        releaseJobSlot();
        endJobTimer({ outcome });
        jobsTotal.inc({ outcome });
    }

    console.log(`Removed work directory: ${workspacePath}`);

    res.status(200).attachment("generated_report.pdf").send(pdfBuffer);

});

app.use((req, res) => {
    res.status(404).send("Not found");
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err); 
        // next(err) used to ensure same error handling routine isn't repeated twice for a single err.
        // idempotency for error handling basically.
    }

    if (err instanceof EngineTimeoutError) {
        // err propogates from engineCaller.js and remains EngineTimeoutError. No error wrapping happens. 
        // if 'docker stop --timeout 1' itself fails, then it becomes a server side error and not a client-side one.
        console.error("Report generation timed out:", err);

        return res.status(504).json({
            message: "Report generation exceeded the 20-second limit.",
            code: "ENGINE_TIMEOUT"
        });
    }

    if (err instanceof EngineExitError && err.exitCode === RENDER_FAILURE_EXIT_CODE) {
        console.error("PDF rendering failed inside the engine:", err);
        return res.status(422).json({
            message: "Your programs ran, but the report could not be converted to PDF. This usually means the code or its output contains characters the PDF engine cannot typeset (for example emoji).",
            code: "REPORT_RENDER_FAILED"
        });
    }

    if (err instanceof EngineExitError) {
        console.error("Engine container failed:", err);
        return res.status(500).json({
            message: "Report generation failed inside the engine.",
            code: "ENGINE_FAILED"
        });
    }

    if (err instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: "Each file must be at most 1 MB",
            LIMIT_FILE_COUNT: "Upload at most 7 files not more",
            LIMIT_UNEXPECTED_FILE: "Use the 'files' fieldname and at most 7 files"
        };

        const status = (err.code === "LIMIT_FILE_SIZE" || err.code === "LIMIT_FILE_COUNT") ? 413 : 400;

        const rejectionReasons = {
            LIMIT_FILE_SIZE: "file_too_large",
            LIMIT_FILE_COUNT: "too_many_files",
            LIMIT_UNEXPECTED_FILE: "unexpected_field"
        };
        uploadRejectionsTotal.inc({ reason: rejectionReasons[err.code] ?? "invalid_upload" });

        return res.status(status).json({
            message: messages[err.code] ?? "Invalid upload request",
            code: err.code
        });
    }

    console.error("Request error:", err); // any other error apart from multerError thrown, simulated.

    return res.status(500).json({
        message: "Internal server error"
    });

});

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

