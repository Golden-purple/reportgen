import express from "express"
import multer from "multer"
import path from "node:path"
import { mkdtempDisposable, writeFile } from "node:fs/promises"
import os from "node:os"

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

// app.post("/api/test", (req, res) => {
//     console.log(req.body.hello);
//     res.status(200).send("received something from client");
// });

app.post("/api/upload", uploadConfig.array("files", 7), async (req, res) => { 
    // the handler is async since mkdtmp returns a promise. Use await... (mkdtmp function) here, so the handler is to be async
    if(!req.files || req.files.length === 0){
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
            return res.status(422).json({
                message: "Only Python, C and C++ files are supported",
                file: file.originalname
            });
        }
        if(file.size === 0){
            return res.status(422).json({
                message: "Uploaded file can't be empty",
                file: file.originalname
            });
        }
    }

    
    let workspacePath;
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

        console.log("All uploaded files were written to disk successfully");
    }

    console.log(`Removed work directory: ${workspacePath}`);

    res.status(200).json({
        message: "Uploaded files received successfully"
    });
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

    if (err instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: "Each file must be at most 1 MB",
            LIMIT_FILE_COUNT: "Upload at most 7 files not more",
            LIMIT_UNEXPECTED_FILE: "Use the 'files' fieldname and at most 7 files"
        };

        const status = (err.code === "LIMIT_FILE_SIZE" || err.code === "LIMIT_FILE_COUNT") ? 413 : 400;

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

app.listen(3000);

