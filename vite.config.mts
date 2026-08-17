import fs from "fs";
import path from "path";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import loadVersion from "vite-plugin-package-version";
import { VitePWA } from "vite-plugin-pwa";
import checker from "vite-plugin-checker";
import { handlebars } from "./plugins/handlebars";
import { PluginOption, loadEnv, splitVendorChunkPlugin } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

import tailwind from "tailwindcss";
import rtl from "postcss-rtlcss";

// Build id for the "new version available" update-notice: the deploying
// GitHub Actions run's commit sha, so it changes on every real deploy.
// package.json's version field doesn't get bumped per-deploy, so it can't be
// used for this. Falls back to a timestamp for local/preview builds.
const BUILD_ID = process.env.GITHUB_SHA || String(Date.now());

// Emits dist/version.json with the same id the client is built against, so
// a running tab can poll it and detect when a newer build has been deployed.
function emitVersionJSON(): PluginOption {
  return {
    name: "emit-version-json",
    apply: "build",
    writeBundle(options) {
      const dir = options.dir || "dist";
      fs.writeFileSync(
        path.join(dir, "version.json"),
        JSON.stringify({ version: BUILD_ID }),
      );
    },
  };
}

/** Vite would otherwise serve api/proxy.ts as source text. Forward it. */
function devApiProxy(): PluginOption {
  return {
    name: "dev-api-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const raw = req.url || "";
        if (!raw.startsWith("/api/proxy")) return next();
        const destination = new URL(raw, "http://localhost").searchParams.get(
          "destination",
        );
        if (!destination) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ error: "Missing destination query parameter" }),
          );
          return;
        }
        let target: URL;
        try {
          target = new URL(destination);
          if (target.protocol !== "http:" && target.protocol !== "https:") {
            throw new Error("Destination must be http(s)");
          }
        } catch {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid destination URL" }));
          return;
        }
        try {
          const headers: Record<string, string> = {
            "User-Agent": String(req.headers["user-agent"] || "Mozilla/5.0"),
            Accept: String(req.headers.accept || "*/*"),
            "Accept-Language": String(req.headers["accept-language"] || "en"),
          };
          if (req.headers["hx-request"]) {
            headers["HX-Request"] = String(req.headers["hx-request"]);
          }
          const upstream = await fetch(target.href, {
            headers,
            redirect: "follow",
          });
          res.statusCode = upstream.status;
          const contentType = upstream.headers.get("content-type");
          if (contentType) res.setHeader("Content-Type", contentType);
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "no-store");
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                err instanceof Error ? err.message : "Proxy request failed",
            }),
          );
        }
      });
    },
  };
}

const captioningPackages = [
  "dompurify",
  "htmlparser2",
  "subsrt-ts",
  "parse5",
  "entities",
  "fuse",
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    base: env.VITE_BASE_URL || "/",
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    plugins: [
      devApiProxy(),
      emitVersionJSON(),
      handlebars({
        vars: {
          opensearchEnabled: env.VITE_OPENSEARCH_ENABLED === "true",
          routeDomain:
            env.VITE_APP_DOMAIN +
            (env.VITE_NORMAL_ROUTER !== "true" ? "/#" : ""),
          domain: env.VITE_APP_DOMAIN,
          env,
        },
      }),
      react({
        babel: {
          presets: [
            "@babel/preset-typescript",
            [
              "@babel/preset-env",
              {
                modules: false,
                useBuiltIns: "entry",
                corejs: {
                  version: "3.34",
                },
              },
            ],
          ],
        },
      }),
      VitePWA({
        disable: env.VITE_PWA_ENABLED !== "true",
        registerType: "autoUpdate",
        workbox: {
          maximumFileSizeToCacheInBytes: 4000000, // 4mb
          globIgnores: ["!assets/**/*"],
        },
        includeAssets: [
          "favicon.ico",
          "apple-touch-icon.png",
          "safari-pinned-tab.svg",
        ],
        manifest: {
          name: "kstream",
          short_name: "kstream",
          description: "Watch your favorite shows and movies for free!",
          theme_color: "#000000",
          background_color: "#000000",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "android-chrome-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "android-chrome-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
      loadVersion(),
      checker({
        overlay: {
          position: "tr",
        },
        typescript: true, // check typescript build errors in dev server
        eslint: {
          // check lint errors in dev server
          lintCommand: "eslint --ext .tsx,.ts --max-warnings 999 src",
          dev: {
            logLevel: ["error"],
          },
        },
      }),
      splitVendorChunkPlugin(),
      visualizer() as PluginOption,
    ],

    build: {
      chunkSizeWarningLimit: 2000,
      sourcemap: mode !== "production",
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (
              id.includes("@sozialhelden+ietf-language-tags") ||
              id.includes("country-language")
            ) {
              return "language-db";
            }
            if (id.includes("hls.js")) {
              return "hls";
            }
            if (id.includes("node-forge") || id.includes("crypto-js")) {
              return "auth";
            }
            if (id.includes("locales") && !id.includes("en.json")) {
              return "locales";
            }
            if (id.includes("react-dom")) {
              return "react-dom";
            }
            if (id.includes("Icon.tsx")) {
              return "Icons";
            }
            const isCaptioningPackage = captioningPackages.some((packageName) =>
              id.includes(packageName),
            );
            if (isCaptioningPackage) {
              return "caption-parsing";
            }
          },
        },
      },
    },
    css: {
      postcss: {
        plugins: [tailwind(), rtl()],
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@themes": path.resolve(__dirname, "./themes"),
        "@sozialhelden/ietf-language-tags": path.resolve(
          __dirname,
          "./node_modules/@sozialhelden/ietf-language-tags/dist/cjs",
        ),
      },
    },

    test: {
      environment: "jsdom",
    },
    preview: {
      host: true,
      port: 80,
      allowedHosts: ["pstream.net", "pstream-test.vercel.app"],
    },
  };
});
