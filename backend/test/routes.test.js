import { test, after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import app from "../app.js";
import { EngineTimeoutError, EngineExitError } from "../engineCaller.js";
import { getActiveJobCount } from "../jobLimiter.js";

const server = app.listen(0);
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

// No test in this file may ever reach the real engine (it needs Docker). Every test starts with a
// guard that throws if the route calls the engine unexpectedly, and the real one is put back afterwards.
const realRunEngine = app.locals.runEngine;
beforeEach(() => {
    app.locals.runEngine = async () => {
        throw new Error("the engine was reached but this test does not expect it");
    };
});
afterEach(() => {
    app.locals.runEngine = realRunEngine;
});

function fakeEngineWritingPdf() {
    return async (workspacePath) => {
        await writeFile(path.join(workspacePath, "work.pdf"), "%PDF-1.4 fake");
    };
}

function uploadForm(files, fieldName = "files") {
    const form = new FormData();
    for (const [name, content] of files) form.append(fieldName, new Blob([content]), name);
    return form;
}

function upload(form) {
    return fetch(`${baseUrl}/api/upload`, { method: "POST", body: form });
}

test("1: an empty form is rejected with 400", async () => {
    const res = await upload(new FormData());
    assert.equal(res.status, 400);
    assert.equal((await res.json()).message, "Upload a minimum of 1 file");
});

test("2: an unsupported extension is rejected with 422", async () => {
    const res = await upload(uploadForm([["note.txt", "not a program"]]));
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.message, "Only Python, C and C++ files are supported");
    assert.equal(body.file, "note.txt");
});

test("3: an empty file is rejected with 422", async () => {
    const res = await upload(uploadForm([["a.py", ""]]));
    assert.equal(res.status, 422);
    assert.equal((await res.json()).message, "Uploaded file can't be empty");
});

test("4: more than 7 files is rejected with 413 LIMIT_FILE_COUNT", async () => {
    const files = Array.from({ length: 8 }, () => ["a.py", "print(1)"]);
    const res = await upload(uploadForm(files));
    assert.equal(res.status, 413);
    assert.equal((await res.json()).code, "LIMIT_FILE_COUNT");
});

test("5: a file over 1 MiB is rejected with 413 LIMIT_FILE_SIZE", async () => {
    const res = await upload(uploadForm([["big.py", "x".repeat(1024 * 1024 + 1)]]));
    assert.equal(res.status, 413);
    assert.equal((await res.json()).code, "LIMIT_FILE_SIZE");
});

test("6: the wrong field name is rejected with 400 LIMIT_UNEXPECTED_FILE", async () => {
    const res = await upload(uploadForm([["a.py", "print(1)"]], "file"));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "LIMIT_UNEXPECTED_FILE");
});

test("7: a valid upload returns the PDF and removes the workspace", async () => {
    let recordedWorkspacePath;
    let recordedListing;
    app.locals.runEngine = async (workspacePath) => {
        recordedWorkspacePath = workspacePath;
        recordedListing = (await readdir(workspacePath)).sort();
        await fakeEngineWritingPdf()(workspacePath);
    };

    const res = await upload(uploadForm([["a.py", "print(1)"], ["b.c", "int main(){}"], ["c.cpp", "int main(){}"]]));
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type").includes("application/pdf"));
    assert.ok(res.headers.get("content-disposition").includes("generated_report.pdf"));
    assert.ok((await res.text()).startsWith("%PDF"));

    assert.deepEqual(recordedListing, ["input-0.py", "input-1.c", "input-2.cpp"]);
    // `await using` in the handler removes the directory before the response is sent.
    assert.equal(existsSync(recordedWorkspacePath), false);
});

test("8: an engine timeout becomes 504 ENGINE_TIMEOUT", async () => {
    app.locals.runEngine = async () => {
        throw new EngineTimeoutError(20000);
    };

    const res = await upload(uploadForm([["a.py", "print(1)"]]));
    assert.equal(res.status, 504);
    assert.equal((await res.json()).code, "ENGINE_TIMEOUT");
});

test("9: engine exit code 3 becomes 422 REPORT_RENDER_FAILED", async () => {
    app.locals.runEngine = async () => {
        throw new EngineExitError(3, null);
    };

    const res = await upload(uploadForm([["a.py", "print(1)"]]));
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, "REPORT_RENDER_FAILED");
});

test("10: any other engine exit code becomes 500 ENGINE_FAILED", async () => {
    app.locals.runEngine = async () => {
        throw new EngineExitError(137, null);
    };

    const res = await upload(uploadForm([["a.py", "print(1)"]]));
    assert.equal(res.status, 500);
    assert.equal((await res.json()).code, "ENGINE_FAILED");
});

test("11: an engine that writes no PDF becomes a generic 500", async () => {
    app.locals.runEngine = async () => {};

    const res = await upload(uploadForm([["a.py", "print(1)"]]));
    assert.equal(res.status, 500);
    assert.equal((await res.json()).message, "Internal server error");
});

test("12: a third concurrent upload is refused with 503 ENGINE_BUSY", async () => {
    let open;
    const gate = new Promise((resolve) => (open = resolve));
    app.locals.runEngine = async (workspacePath) => {
        await gate;
        await fakeEngineWritingPdf()(workspacePath);
    };

    // Not awaited: both requests sit inside the fake engine until the gate opens.
    const first = upload(uploadForm([["a.py", "print(1)"]]));
    const second = upload(uploadForm([["a.py", "print(1)"]]));

    const deadline = Date.now() + 2000;
    while (getActiveJobCount() !== 2) {
        if (Date.now() > deadline) {
            open();
            assert.fail(`expected 2 active jobs, saw ${getActiveJobCount()}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const busy = await upload(uploadForm([["a.py", "print(1)"]]));
    assert.equal(busy.status, 503);
    assert.equal(busy.headers.get("retry-after"), "5");
    assert.equal((await busy.json()).code, "ENGINE_BUSY");

    open();
    const [firstRes, secondRes] = await Promise.all([first, second]);
    assert.equal(firstRes.status, 200);
    assert.equal(secondRes.status, 200);
    await firstRes.arrayBuffer();
    await secondRes.arrayBuffer();

    assert.equal(getActiveJobCount(), 0);
});

test("13: no failure path leaked a job slot", () => {
    assert.equal(getActiveJobCount(), 0);
});
