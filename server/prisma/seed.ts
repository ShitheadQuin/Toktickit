import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { LOCAL_DEV_INITIAL_PASSWORD } from './seed-credentials';

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

// Local development accounts (labsheet §5.3). The first five are the Lab 2 Development Requesters.
const ANONG = 'anong.srisai@toktickit.dev';
const KRITSADA = 'kritsada.boonmee@toktickit.dev';
const NALINEE = 'nalinee.chaiyaporn@toktickit.dev';
const PIMCHANOK = 'pimchanok.rattana@toktickit.dev';
const THANAWAT = 'thanawat.kittisak@toktickit.dev';
const WIRIYA = 'wiriya.charoen@toktickit.dev';

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';

const users: { name: string; email: string; role: Role; isActive: boolean }[] = [
  { name: 'Anong Srisai', email: ANONG, role: 'REQUESTER', isActive: true },
  { name: 'Kritsada Boonmee', email: KRITSADA, role: 'REQUESTER', isActive: true },
  { name: 'Suphachai Wattana', email: 'suphachai.wattana@toktickit.dev', role: 'REQUESTER', isActive: true },
  { name: 'Nalinee Chaiyaporn', email: NALINEE, role: 'REQUESTER', isActive: true },
  { name: 'Ratchanee Somsak', email: 'ratchanee.somsak@toktickit.dev', role: 'REQUESTER', isActive: false },
  { name: 'Pimchanok Rattana', email: PIMCHANOK, role: 'IT_STAFF', isActive: true },
  { name: 'Thanawat Kittisak', email: THANAWAT, role: 'IT_STAFF', isActive: true },
  { name: 'Wiriya Charoen', email: WIRIYA, role: 'IT_STAFF', isActive: true },
  { name: 'Somporn Inthara', email: 'somporn.inthara@toktickit.dev', role: 'IT_STAFF', isActive: false },
  { name: 'Duangjai Meesuk', email: 'duangjai.meesuk@toktickit.dev', role: 'ADMINISTRATOR', isActive: true },
];

type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
type Status =
  | 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';
type SeedEntry = { author: string; body: string };
type SeedTicket = {
  ticketNumber: string;
  requester: string;
  owner: string | null;
  category: string;
  relatedSystem: string;
  summary: string;
  description: string;
  requestedPriority: Priority;
  itPriority: Priority;
  status: Status;
  requesterConfirmed?: boolean;
  comments: SeedEntry[];
  notes: SeedEntry[];
};

// Fixed numbers in a range the app's ticket_number_seq will not reach, so a re-run finds them.
// States follow the specification.md §11 transition matrix: New and Cancelled-from-New Tickets
// have no owner; every other status has one.
const tickets: SeedTicket[] = [
  {
    ticketNumber: 'TKT-2026-800001', requester: ANONG, owner: null,
    category: 'Network', relatedSystem: 'Campus Wi-Fi',
    summary: 'Wi-Fi keeps dropping in the Building 4 lecture hall',
    description: 'The connection drops every few minutes during lectures in room 4-201.',
    requestedPriority: 'HIGH', itPriority: 'HIGH', status: 'NEW', comments: [], notes: [],
  },
  {
    ticketNumber: 'TKT-2026-800002', requester: KRITSADA, owner: null,
    category: 'Account and Access', relatedSystem: 'Student Portal',
    summary: 'Exam timetable not visible in the Student Portal',
    description: 'The timetable page is empty although my classmates can see theirs.',
    requestedPriority: 'LOW', itPriority: 'LOW', status: 'NEW', comments: [], notes: [],
  },
  {
    ticketNumber: 'TKT-2026-800003', requester: NALINEE, owner: PIMCHANOK,
    category: 'Hardware', relatedSystem: 'Printing Service',
    summary: 'Library printer reports a paper jam with no paper stuck',
    description: 'The second-floor library printer shows a jam error and will not print.',
    requestedPriority: 'MEDIUM', itPriority: 'HIGH', status: 'OPEN',
    comments: [{ author: PIMCHANOK, body: 'I have taken this ticket and will check the printer this afternoon.' }],
    notes: [{ author: PIMCHANOK, body: 'Same model had a faulty paper sensor last term. A spare sensor is in the IT store.' }],
  },
  {
    ticketNumber: 'TKT-2026-800004', requester: ANONG, owner: THANAWAT,
    category: 'Software', relatedSystem: 'Learning Management System',
    summary: 'Assignment upload fails with a timeout',
    description: 'Uploading my project report stops at about 80% and then shows a timeout.',
    requestedPriority: 'HIGH', itPriority: 'HIGH', status: 'IN_PROGRESS',
    comments: [
      { author: ANONG, body: 'It happens on both Chrome and Edge, every time.' },
      { author: THANAWAT, body: 'Thanks. We can reproduce it with files over 50 MB and are checking the upload limit.' },
    ],
    notes: [{ author: THANAWAT, body: 'LMS proxy upload limit is 50 MB. Raising it needs approval from the LMS team.' }],
  },
  {
    ticketNumber: 'TKT-2026-800005', requester: KRITSADA, owner: WIRIYA,
    category: 'Network', relatedSystem: 'VPN',
    summary: 'VPN connects but internal sites do not load',
    description: 'The VPN shows connected, but the library database and intranet time out.',
    requestedPriority: 'MEDIUM', itPriority: 'LOW', status: 'IN_PROGRESS',
    comments: [],
    notes: [{ author: WIRIYA, body: 'Split-tunnel rule for the internal subnet looks missing from the VPN profile.' }],
  },
  {
    ticketNumber: 'TKT-2026-800006', requester: NALINEE, owner: PIMCHANOK,
    category: 'Account and Access', relatedSystem: 'Email',
    summary: 'Email password reset link has expired',
    description: 'The reset link from the account page says it has expired as soon as I open it.',
    requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'WAITING_FOR_REQUESTER',
    comments: [{ author: PIMCHANOK, body: 'Please try the new reset link sent to your university email and reply here if it still fails.' }],
    notes: [],
  },
  {
    ticketNumber: 'TKT-2026-800007', requester: ANONG, owner: THANAWAT,
    category: 'Software', relatedSystem: 'Email',
    summary: 'Calendar invitations arrive without the meeting link',
    description: 'Invitations from my advisor show the time but not the online meeting link.',
    requestedPriority: 'LOW', itPriority: 'LOW', status: 'RESOLVED', requesterConfirmed: true,
    comments: [
      { author: THANAWAT, body: 'The calendar sync setting has been corrected. Please check your next invitation.' },
      { author: ANONG, body: 'The links show up now, thank you.' },
    ],
    notes: [],
  },
  {
    ticketNumber: 'TKT-2026-800008', requester: KRITSADA, owner: WIRIYA,
    category: 'Hardware', relatedSystem: 'Printing Service',
    summary: 'Printing quota not refreshed at the start of term',
    description: 'My printing balance still shows last term\'s remaining pages.',
    requestedPriority: 'LOW', itPriority: 'MEDIUM', status: 'CLOSED', comments: [], notes: [],
  },
  {
    ticketNumber: 'TKT-2026-800009', requester: NALINEE, owner: PIMCHANOK,
    category: 'Network', relatedSystem: 'Campus Wi-Fi',
    summary: 'Wi-Fi certificate warning came back after the fix',
    description: 'The certificate warning appears again when joining campus Wi-Fi from my laptop.',
    requestedPriority: 'HIGH', itPriority: 'HIGH', status: 'REOPENED',
    comments: [],
    notes: [{ author: PIMCHANOK, body: 'Certificate was renewed on only one controller. Reopened to fix the second one.' }],
  },
  {
    ticketNumber: 'TKT-2026-800010', requester: ANONG, owner: null,
    category: 'Account and Access', relatedSystem: 'Student Portal',
    summary: 'Student Portal login loop (duplicate request)',
    description: 'Submitted twice by mistake; the same problem is tracked in another ticket.',
    requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'CANCELLED', comments: [], notes: [],
  },
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function lookup(ids: Map<string, number>, key: string): number {
  const id = ids.get(key);
  if (id === undefined) throw new Error(`Seed reference not found: ${key}`);
  return id;
}

async function main() {
  for (const name of categoryNames) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const name of relatedSystemNames) {
    await prisma.relatedSystem.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Used only when an account is first created. Existing accounts are never overwritten, so a
  // password changed during a demo survives a re-seed.
  const passwordHash = await bcrypt.hash(LOCAL_DEV_INITIAL_PASSWORD, 12);
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash, mustChangePassword: true },
    });
  }

  const userIds = new Map((await prisma.user.findMany()).map((u) => [u.email, u.id]));
  const categoryIds = new Map((await prisma.category.findMany()).map((c) => [c.name, c.id]));
  const relatedSystemIds = new Map((await prisma.relatedSystem.findMany()).map((s) => [s.name, s.id]));

  const now = Date.now();
  for (const [index, t] of tickets.entries()) {
    const createdAt = new Date(now - (tickets.length - index) * DAY);
    const ticket = await prisma.ticket.upsert({
      where: { ticketNumber: t.ticketNumber },
      update: {},
      create: {
        ticketNumber: t.ticketNumber,
        ticketDate: createdAt,
        createdAt,
        requesterId: lookup(userIds, t.requester),
        ticketOwnerId: t.owner ? lookup(userIds, t.owner) : null,
        categoryId: lookup(categoryIds, t.category),
        relatedSystemId: lookup(relatedSystemIds, t.relatedSystem),
        summary: t.summary,
        description: t.description,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.status,
        requesterConfirmedAt: t.requesterConfirmed ? new Date(createdAt.getTime() + 20 * HOUR) : null,
      },
    });

    // Comments and Notes are append-only, so they are added only to a Ticket that has none yet.
    if (t.comments.length > 0 && (await prisma.publicComment.count({ where: { ticketId: ticket.id } })) === 0) {
      await prisma.publicComment.createMany({
        data: t.comments.map((c, i) => ({
          ticketId: ticket.id,
          authorId: lookup(userIds, c.author),
          body: c.body,
          createdAt: new Date(createdAt.getTime() + (i + 1) * HOUR),
        })),
      });
    }
    if (t.notes.length > 0 && (await prisma.internalNote.count({ where: { ticketId: ticket.id } })) === 0) {
      await prisma.internalNote.createMany({
        data: t.notes.map((n, i) => ({
          ticketId: ticket.id,
          authorId: lookup(userIds, n.author),
          body: n.body,
          createdAt: new Date(createdAt.getTime() + (i + 1) * HOUR + 30 * 60 * 1000),
        })),
      });
    }
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
