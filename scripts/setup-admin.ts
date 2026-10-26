/**
 * One-time initial administrator setup.
 *
 * Usage: `pnpm setup:admin` (run on the server, interactive terminal only).
 *
 * There is no default admin account and no known default password. This
 * script refuses to run if any administrator already exists; further accounts
 * are managed through the Team screen.
 */
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "../src/lib/auth/password";
import { prisma } from "../src/lib/db/client";
import { PASSWORD_MIN_LENGTH } from "../src/lib/validation/auth";

const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]*$/;

/** Prompts without echoing the input (falls back to visible input off-TTY). */
async function askHidden(query: string): Promise<string> {
  if (!stdin.isTTY) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      return (await rl.question(query)).trim();
    } finally {
      rl.close();
    }
  }

  stdout.write(query);
  return new Promise((resolve) => {
    const input = stdin;
    const wasRaw = input.isRaw ?? false;
    input.setRawMode(true);
    input.resume();
    let value = "";

    const onKeypress = (
      chunk: string,
      key: { name?: string; ctrl?: boolean; meta?: boolean } | undefined,
    ) => {
      if (key?.name === "return" || key?.name === "enter") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (key?.ctrl && key?.name === "c") {
        cleanup();
        stdout.write("\n");
        process.exit(130);
      }
      if (key?.name === "backspace") {
        value = value.slice(0, -1);
        stdout.write("\b \b");
        return;
      }
      if (chunk && !key?.ctrl && !key?.meta) {
        value += chunk;
        stdout.write("*");
      }
    };

    function cleanup() {
      input.removeListener("keypress", onKeypress);
      input.setRawMode(wasRaw);
      input.pause();
    }

    input.on("keypress", onKeypress);
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL is not set. Copy .env.example to .env first.");
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { username: true },
  });
  if (existingAdmin) {
    fail(
      `An administrator already exists (@${existingAdmin.username}).\n` +
        "Initial setup can only run once. Use the Team screen to add more accounts.",
    );
  }

  if (!stdin.isTTY) {
    fail("This command requires an interactive terminal.");
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  let displayName = "";
  let username = "";
  try {
    displayName = (await rl.question("Display name: ")).trim();
    if (!displayName) fail("Display name is required.");

    username = (await rl.question("Username: ")).trim().toLowerCase();
    if (!USERNAME_RE.test(username) || username.length > 50) {
      fail(
        "Username must be 1-50 characters: letters, numbers, dots, dashes, underscores.",
      );
    }
  } finally {
    rl.close();
  }

  const usernameTaken = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (usernameTaken) fail("That username is already taken.");

  const password = await askHidden(
    `Password (min ${PASSWORD_MIN_LENGTH} characters): `,
  );
  const confirm = await askHidden("Confirm password: ");
  if (password.length < PASSWORD_MIN_LENGTH) {
    fail(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password !== confirm) fail("Passwords do not match.");

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { displayName, username, role: "ADMIN", passwordHash },
  });
  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: "setup.admin.create",
      targetType: "user",
      targetId: user.id,
      summary: { username: user.username, via: "setup-cli" },
    },
  });

  console.log(
    `\nAdministrator @${user.username} created. Sign in at /login and change the password after first use.\n`,
  );
}

main().catch((error) => {
  console.error("Setup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
