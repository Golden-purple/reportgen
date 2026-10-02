import express from "express"

const app = express();   

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`.toUpperCase());
    next();
    console.log("Request passed through middleware");
});

app.get("/", (req, res) => {
    res.status(200).send("reportgen backend");
});

app.get("/api/health", (req, res) => {
    res.status(200).send("OK");
});

app.use((req, res) => {
    res.status(404).send("Not found");
});

app.listen(3000);

