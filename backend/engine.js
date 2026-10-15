import { spawn } from "node:child_process";

export async function runEngine(workspacePath) {
    // function declared as async explicitly as async functions return promises.
    return new Promise((resolve, reject) => {
        const mountArgument = `type=bind,source=${workspacePath},target=/work`;

        const dockerArgs = [
            "run", "--rm",
            "--mount", mountArgument,
            "reportgen-engine:dev",
            "reportgen", "/work"
        ];

        const child = spawn("docker", dockerArgs, {
            stdio: "inherit"
        });

        child.once("error", (error) => {
            reject(error);
        });

        child.once("close", (code, signal) => {
            if (code === 0){
                resolve();
            } 
            else{
                reject(new Error(`Docker failed with: exit code ${code}, signal ${signal}`));
            }
        });
    });
}