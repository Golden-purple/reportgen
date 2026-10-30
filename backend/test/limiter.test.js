import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MAX_ACTIVE_JOBS, tryAcquireJobSlot, getActiveJobCount } from "../jobLimiter.js";

// The limiter keeps its counter at module level. Each test file runs in its own process,
// and the tests below run in order, so they share this one counter on purpose.
const backendDir = path.resolve(import.meta.dirname, "..");
const releases = [];

test("default limit is 2 and a third acquire is refused", () => {
    assert.equal(MAX_ACTIVE_JOBS, 2);

    const first = tryAcquireJobSlot();
    const second = tryAcquireJobSlot();
    assert.equal(typeof first, "function");
    assert.equal(typeof second, "function");
    releases.push(first, second);

    assert.equal(tryAcquireJobSlot(), null);
    assert.equal(getActiveJobCount(), 2);
});

test("releasing the same slot twice lowers the count only once", () => {
    const [first] = releases;
    first();
    first();
    assert.equal(getActiveJobCount(), 1);

    const again = tryAcquireJobSlot();
    assert.equal(typeof again, "function");
    releases.push(again);
    assert.equal(getActiveJobCount(), 2);
});

test("releasing every slot returns the count to 0", () => {
    for (const release of releases) release();
    assert.equal(getActiveJobCount(), 0);
});

// The limit is read when the module is first evaluated, so each value needs a fresh process.
function importLimiterWith(value) {
    return spawnSync(
        process.execPath,
        ["--input-type=module", "-e", "await import('./jobLimiter.js')"],
        { cwd: backendDir, env: { ...process.env, REPORTGEN_MAX_ACTIVE_JOBS: value }, encoding: "utf8" }
    );
}

for (const value of ["abc", "0", "1.5"]) {
    test(`REPORTGEN_MAX_ACTIVE_JOBS=${value} is rejected at startup`, () => {
        const result = importLimiterWith(value);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /REPORTGEN_MAX_ACTIVE_JOBS must be a positive integer/);
    });
}

test("REPORTGEN_MAX_ACTIVE_JOBS=3 is accepted", () => {
    const result = importLimiterWith("3");
    assert.equal(result.status, 0);
});
