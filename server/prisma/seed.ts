import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const categoryNames = ['Account and Access', 'Hardware', 'Software', 'Network'];

const relatedSystemNames = [
  'Campus Wi-Fi',
  'Student Portal',
  'Email',
  'Learning Management System',
  'Printing Service',
  'VPN',
];

const requesters = [
  { name: 'Anong Srisai', email: 'anong.srisai@toktickit.dev', isActive: true },
  { name: 'Kritsada Boonmee', email: 'kritsada.boonmee@toktickit.dev', isActive: true },
  { name: 'Suphachai Wattana', email: 'suphachai.wattana@toktickit.dev', isActive: true },
  { name: 'Nalinee Chaiyaporn', email: 'nalinee.chaiyaporn@toktickit.dev', isActive: true },
  { name: 'Ratchanee Somsak', email: 'ratchanee.somsak@toktickit.dev', isActive: false },
];

async function main() {
  for (const name of categoryNames) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of relatedSystemNames) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const requester of requesters) {
    await prisma.requester.upsert({
      where: { email: requester.email },
      update: {},
      create: requester,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
