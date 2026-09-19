/**
 * Creates (or re-activates) the first ADMIN account from SEED_ADMIN_* in backend/.env.
 * Idempotent: an existing account keeps its password unless SEED_ADMIN_RESET_PASSWORD=true.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? '';
const name = process.env.SEED_ADMIN_NAME?.trim() || 'Admin';
const resetPassword = process.env.SEED_ADMIN_RESET_PASSWORD === 'true';

if (!email || !password) {
  throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in backend/.env before seeding.');
}
if (password.length < 12) {
  throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

try {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        role: 'ADMIN',
        isActive: true,
        ...(resetPassword && { passwordHash: await hash(password, { type: argon2id }) }),
      },
    });
    console.log(`Admin ${email} already exists — ensured ADMIN role and active status.`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name,
        role: 'ADMIN',
        passwordHash: await hash(password, { type: argon2id }),
      },
    });
    console.log(`Created admin ${email}.`);
  }
} finally {
  await prisma.$disconnect();
}
