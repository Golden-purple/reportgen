import express from "express"
import multer from "multer"
import path from "node:path"

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

app.post("/api/upload", uploadConfig.array("files", 7), (req, res) => {
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
    }

    res.status(200).json({
        message: "Uploaded files received successfully"
    });
});

app.use((req, res) => {
    res.status(404).send("Not found");
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err); // next(err) used to ensure same error handling routine isn't repeated twice for a single err.
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

    console.error("Request error:", err);

    return res.status(500).json({
        message: "Internal server error"
    });

});

app.listen(3000);

