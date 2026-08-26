import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../supabase/functions/discord-bot");

const files = ["index.ts", "config.ts", "discord.ts", "embeds.ts", "commands.ts"].map((name) => ({
  name,
  content: fs.readFileSync(path.join(root, name), "utf8"),
}));

const payload = {
  project_id: "khplnaovkxvzhbimuvzn",
  name: "discord-bot",
  entrypoint_path: "index.ts",
  verify_jwt: false,
  files,
};

fs.writeFileSync(
  path.join(__dirname, "deploy-payload.json"),
  JSON.stringify(payload),
);

console.log("Wrote deploy-payload.json", files.map((f) => f.name).join(", "));
