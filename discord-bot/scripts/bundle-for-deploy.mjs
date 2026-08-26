import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../supabase/functions/discord-bot");
const out = path.join(__dirname, "discord-bot.bundle.ts");

const stripImports = (src) =>
  src.replace(/^import .+;\n/gm, "").replace(/^import ".+";\n/gm, "");

const discord = fs.readFileSync(path.join(root, "discord.ts"), "utf8");
const embeds = fs.readFileSync(path.join(root, "embeds.ts"), "utf8");
const commands = fs.readFileSync(path.join(root, "commands.ts"), "utf8");
const index = fs.readFileSync(path.join(root, "index.ts"), "utf8");

const bundled = `import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- discord.ts ---
${stripImports(discord)}

// --- embeds.ts ---
${stripImports(embeds)}

// --- commands.ts ---
${stripImports(commands.replace('from "./discord.ts"', "").replace('from "./embeds.ts"', ""))}

// --- index.ts ---
${stripImports(index.replace('from "./discord.ts"', "").replace('from "./commands.ts"', ""))}
`;

fs.writeFileSync(out, bundled);
console.log("Wrote", out, bundled.length, "chars");
