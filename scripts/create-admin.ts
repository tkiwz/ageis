/**
 * Create (or reset) the real administrator account.
 *
 *   npx tsx scripts/create-admin.ts
 *
 * Asks for name, email and password in the terminal. The password is
 * checked for strength and stored as a bcrypt hash only.
 */
import { createInterface } from "node:readline";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { checkPasswordStrength } from "../src/lib/security/password";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

/** Read a line without echoing it. */
function askHidden(q: string): Promise<string> {
  return new Promise((res) => {
    process.stdout.write(q);
    const onData = (buf: Buffer) => {
      const c = buf.toString();
      if (c === "\n" || c === "\r" || c === "\r\n") {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdout.write("\n");
        res(value);
      } else if (c === "\u0003") {
        process.exit(1);
      } else if (c === "\u007f" || c === "\b") {
        value = value.slice(0, -1);
      } else {
        value += c;
      }
    };
    let value = "";
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function main() {
  const db = new PrismaClient();
  try {
    const name = (await ask("Full name: ")).trim();
    const email = ((await ask("Email [admin@aegis.com]: ")).trim() || "admin@aegis.com").toLowerCase();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Name and a valid email are required.");

    rl.pause();
    const password = await askHidden("Password: ");
    const confirm = await askHidden("Confirm password: ");
    if (password !== confirm) throw new Error("Passwords do not match.");

    const strength = checkPasswordStrength(password, { email, name });
    if (!strength.ok) throw new Error(strength.reasons.join(" "));

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.user.upsert({
      where: { email },
      update: { name, role: "ADMIN", isActive: true, passwordHash },
      create: { email, name, role: "ADMIN", isActive: true, passwordHash },
    });
    console.log(`\n✓ Admin ready: ${user.email}`);
  } catch (e) {
    console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  } finally {
    rl.close();
    await db.$disconnect();
  }
}

main();
