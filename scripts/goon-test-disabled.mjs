/**
 * Launch disabled-source goon bench in the providers repo.
 *
 *   node scripts/goon-test-disabled.mjs
 *   node scripts/goon-test-disabled.mjs --quick
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROVIDERS_ROOT =
  process.env.GOON_PROVIDERS_SRC || path.resolve(ROOT, "../providers");
const quick = process.argv.includes("--quick");

const child = spawn(
  "pnpm",
  ["exec", "vite-node", "scripts/goon-disabled-bench.mjs", ...(quick ? ["--quick"] : [])],
  {
    cwd: PROVIDERS_ROOT,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      KSTREAM_ROOT: ROOT,
    },
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
