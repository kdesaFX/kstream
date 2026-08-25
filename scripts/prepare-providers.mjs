#!/usr/bin/env node
/**
 * Wire the private kdesaFX/providers repo for CI / Cloudflare Workers Builds.
 *
 * Requires PROVIDERS_DEPLOY_KEY (SSH private key) or GITHUB_TOKEN/GH_TOKEN.
 * Rewrites package.json to file:./.providers-src and drops the lockfile so
 * pnpm does not try to fetch the private GitHub tarball.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROVIDERS_DIR = ".providers-src";
const PROVIDERS_REF = process.env.PROVIDERS_REF || "production";
const REPO_SSH = "git@github.com:kdesaFX/providers.git";

function providersReady() {
  return fs.existsSync(path.join(PROVIDERS_DIR, "package.json"));
}

function cloneProviders() {
  if (providersReady()) {
    console.log("[prepare-providers] using existing .providers-src");
    return;
  }

  const deployKey = process.env.PROVIDERS_DEPLOY_KEY;
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  if (deployKey) {
    const keyPath = path.join(os.tmpdir(), `providers-deploy-key-${process.pid}`);
    fs.writeFileSync(keyPath, deployKey.endsWith("\n") ? deployKey : `${deployKey}\n`, {
      mode: 0o600,
    });
    const gitEnv = {
      ...process.env,
      GIT_SSH_COMMAND: `ssh -i ${keyPath} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes`,
    };
    execSync(
      `git clone --depth 1 --branch ${PROVIDERS_REF} ${REPO_SSH} ${PROVIDERS_DIR}`,
      { stdio: "inherit", env: gitEnv },
    );
    fs.rmSync(keyPath, { force: true });
    return;
  }

  if (githubToken) {
    execSync(
      `git clone --depth 1 --branch ${PROVIDERS_REF} https://x-access-token:${githubToken}@github.com/kdesaFX/providers.git ${PROVIDERS_DIR}`,
      { stdio: "inherit" },
    );
    return;
  }

  console.error(
    "[prepare-providers] missing PROVIDERS_DEPLOY_KEY or GITHUB_TOKEN; cannot clone private providers repo",
  );
  process.exit(1);
}

function buildProviders() {
  const env = { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "1" };
  execSync("pnpm install", { cwd: PROVIDERS_DIR, stdio: "inherit", env });
  execSync("pnpm run build", { cwd: PROVIDERS_DIR, stdio: "inherit", env });
}

function wireLocalDependency() {
  const pkgPath = "package.json";
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.dependencies["@p-stream/providers"] = "file:./.providers-src";
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function dropLockfile() {
  if (fs.existsSync("pnpm-lock.yaml")) {
    fs.rmSync("pnpm-lock.yaml");
    console.log("[prepare-providers] removed pnpm-lock.yaml (providers now file:./.providers-src)");
  }
}

cloneProviders();
buildProviders();
wireLocalDependency();
dropLockfile();
