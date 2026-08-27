#!/usr/bin/env node
/**
 * Pull the latest kstream-Setup.exe from GitHub Releases into R2
 * (bucket: kstream-downloads) so /download/kstream-Setup.exe is fast.
 *
 * Usually unnecessary: Worker cron + GitHub Action sync every ~4 hours.
 * Usage: pnpm run sync:installer
 */
import { mkdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tmpDir = path.join(root, ".tmp");
const localFile = path.join(tmpDir, "kstream-Setup.exe");
const githubUrl =
  "https://github.com/kdesaFX/kstream-desktop/releases/latest/download/kstream-Setup.exe";
const r2Key = "kstream-downloads/kstream-Setup.exe";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: root,
      ...opts,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

await mkdir(tmpDir, { recursive: true });
console.log("Downloading", githubUrl);
await run("curl", ["-L", "--retry", "3", "-o", localFile, githubUrl]);
const { size } = await stat(localFile);
console.log(`Downloaded ${(size / (1024 * 1024)).toFixed(1)} MB`);

console.log("Uploading to R2", r2Key);
await run("npx", [
  "wrangler",
  "r2",
  "object",
  "put",
  r2Key,
  "--file",
  localFile,
  "--content-type",
  "application/octet-stream",
  "--remote",
]);

await rm(localFile, { force: true });
console.log("Done. /download/kstream-Setup.exe serves from R2.");
