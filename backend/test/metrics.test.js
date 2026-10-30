import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import app from "../app.js";
import { EngineTimeoutError, EngineExitError } from "../engineCaller.js";
import { classifyJobError, languageForExtension } from "../metrics.js";

const server = app.listen(0);
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

const realRunEngine = app.locals.runEngine;
afterEach(() => {
    app.locals.runEngine = realRunEngine;
});

async function upload(files) {
    const form = new FormData();
    for (const [name, content] of files) form.append("files", new Blob([content]), name);
    return fetch(`${baseUrl}/api/upload`, { method: "POST", body: form });
}

// Exact-line matching, so a line ending in "1" can never match one ending in "10".
async function metricLines() {
    const res = await fetch(`${baseUrl}/metrics`);
    return (await res.text()).split("\n");
}

test("classifyJobError maps engine failures to metric outcomes", () => {
    assert.equal(classifyJobError(new EngineTimeoutError(20000)), "timeout");
    assert.equal(
        classifyJobError(new AggregateError([new EngineTimeoutError(20000), new Error("stop")])),
        "timeout"
    );
    assert.equal(classifyJobError(new EngineExitError(3, null)), "render_failed");
    assert.equal(classifyJobError(new EngineExitError(137, null)), "error");
    assert.equal(classifyJobError(new Error("boom")), "error");
});

test("languageForExtension maps extensions to language labels", () => {
    assert.equal(languageForExtension(".py"), "python");
    assert.equal(languageForExtension(".c"), "c");
    assert.equal(languageForExtension(".cpp"), "cpp");
});

test("GET /metrics serves every pre-initialised series at zero", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type").startsWith("text/plain"));

    const lines = (await res.text()).split("\n");
    for (const outcome of ["success", "timeout", "render_failed", "busy", "error"]) {
        assert.ok(lines.includes(`reportgen_jobs_total{outcome="${outcome}"} 0`), `jobs_total ${outcome}`);
    }
    for (const language of ["python", "c", "cpp"]) {
        assert.ok(lines.includes(`reportgen_uploaded_files_total{language="${language}"} 0`), `uploaded_files ${language}`);
    }
    for (const reason of ["no_files", "unsupported_extension", "empty_file", "file_too_large", "too_many_files", "unexpected_field", "invalid_upload"]) {
        assert.ok(lines.includes(`reportgen_upload_rejections_total{reason="${reason}"} 0`), `rejections ${reason}`);
    }
    assert.ok(lines.includes("reportgen_max_active_jobs 2"));
    assert.ok(lines.includes("reportgen_active_jobs 0"));
});

test("a successful upload is counted by outcome, language and duration", async () => {
    app.locals.runEngine = async (workspacePath) => {
        await writeFile(path.join(workspacePath, "work.pdf"), "%PDF-1.4 fake");
    };

    const res = await upload([["a.py", "print(1)"], ["b.c", "int main(){}"]]);
    assert.equal(res.status, 200);
    await res.arrayBuffer();

    const lines = await metricLines();
    assert.ok(lines.includes('reportgen_jobs_total{outcome="success"} 1'));
    assert.ok(lines.includes('reportgen_uploaded_files_total{language="python"} 1'));
    assert.ok(lines.includes('reportgen_uploaded_files_total{language="c"} 1'));
    assert.ok(lines.includes('reportgen_job_duration_seconds_count{outcome="success"} 1'));
});

test("a rejected upload is counted by reason", async () => {
    const res = await upload([["note.txt", "not a program"]]);
    assert.equal(res.status, 422);
    await res.arrayBuffer();

    const lines = await metricLines();
    assert.ok(lines.includes('reportgen_upload_rejections_total{reason="unsupported_extension"} 1'));
});
