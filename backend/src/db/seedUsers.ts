import { hashPassword } from "../auth/passwords.js";
import { prisma } from "./prisma.js";

/**
 * Two default workshop employees, per the user's explicit request: seeded
 * here, and their credentials are shown directly on the frontend's login
 * screen so anyone testing the app can sign in without being handed a
 * password out of band.
 */
const ACCOUNTS = [
  { email: "admin@servicedesk.local", password: "Workshop2026!", name: "Nasrin Akter", role: "admin" },
  { email: "workshop@servicedesk.local", password: "Workshop2026!", name: "Kamal Hossain", role: "workshop" },
];

async function main(): Promise<void> {
  for (const account of ACCOUNTS) {
    const passwordHash = await hashPassword(account.password);
    await prisma.workshopUser.upsert({
      where: { email: account.email },
      create: { email: account.email, passwordHash, name: account.name, role: account.role },
      update: { passwordHash, name: account.name, role: account.role },
    });
    console.log(`  ${account.email} (${account.role})`);
  }
  console.log(`\n[seed-users] demo password for both accounts: Workshop2026!`);
  console.log("[seed-users] done");
}

main()
  .catch((error: unknown) => {
    console.error("[seed-users] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
