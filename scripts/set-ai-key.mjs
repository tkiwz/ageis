#!/usr/bin/env node
/**
 * Save the GLM fallback key into .env (asks for it, hidden while typing).
 *
 *   npm run set-ai-key
 *
 * Adds or replaces ZHIPU_API_KEY in .env. The key is never printed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = ".env";
const NAME = "ZHIPU_API_KEY";

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let value = "";
    const onData = (buf) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          return resolve(value.trim());
        }
        if (ch === "\u0003") process.exit(1); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

const key = await askHidden("Paste the GLM (Zhipu) API key and press Enter: ");
if (!/^[\w-]+\.[\w-]+$/.test(key)) {
  console.error("✗ That doesn't look like a Zhipu key (format: xxxx.yyyy). Nothing was changed.");
  process.exit(1);
}

let env = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const line = `${NAME}="${key}"`;
env = new RegExp(`^${NAME}=.*$`, "m").test(env)
  ? env.replace(new RegExp(`^${NAME}=.*$`, "m"), line)
  : `${env.replace(/\n?$/, "\n")}${line}\n`;
writeFileSync(FILE, env);
console.log(`✓ ${NAME} saved in ${FILE} (${key.slice(0, 4)}…). Restart the app to use it.`);
