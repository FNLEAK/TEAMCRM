import { PrismaClient, PipelineStage } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STAGES: PipelineStage[] = [
  PipelineStage.NEW,
  PipelineStage.ATTEMPTED_CONTACT,
  PipelineStage.CONNECTED,
  PipelineStage.QUALIFIED,
  PipelineStage.APPOINTMENT_BOOKED,
  PipelineStage.CLOSED_WON,
  PipelineStage.CLOSED_LOST,
];

const prefixes = [
  "Summit",
  "Blue Ridge",
  "Metro",
  "Coastal",
  "Pioneer",
  "Harbor",
  "Atlas",
  "Vertex",
  "Northwind",
  "Silverline",
];
const suffixes = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electric",
  "Landscaping",
  "Cleaning",
  "Restoration",
  "Construction",
  "Services",
  "Solutions",
];

function randomStage(i: number): PipelineStage {
  return STAGES[i % STAGES.length];
}

async function main() {
  const existing = await prisma.workspace.findFirst();
  if (existing) {
    const count = await prisma.lead.count({ where: { workspaceId: existing.id } });
    if (count >= 50) {
      console.log("Seed skipped: workspace already has leads.");
      return;
    }
  }

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const workspace = existing
    ? existing
    : await prisma.workspace.create({
        data: { name: "Demo Workspace" },
      });

  let user = await prisma.user.findFirst({ where: { workspaceId: workspace.id } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: "demo@pipeline.local",
        passwordHash,
        name: "Demo User",
        workspaceId: workspace.id,
      },
    });
  }

  const second = await prisma.user.findFirst({
    where: { workspaceId: workspace.id, NOT: { id: user.id } },
  });
  const teammate =
    second ??
    (await prisma.user.create({
      data: {
        email: "teammate@pipeline.local",
        passwordHash,
        name: "Alex Team",
        workspaceId: workspace.id,
      },
    }));

  const toCreate = 50 - (await prisma.lead.count({ where: { workspaceId: workspace.id } }));
  for (let n = 0; n < toCreate; n++) {
    const i = (await prisma.lead.count()) + n;
    const title = `${prefixes[i % prefixes.length]} ${suffixes[(i * 3) % suffixes.length]} ${i + 1}`;
    const stage = randomStage(i);
    const assigneeId = i % 3 === 0 ? user.id : i % 3 === 1 ? teammate.id : null;
    await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        title,
        contactName: `Contact ${i + 1}`,
        email: `lead${i + 1}@example.com`,
        phone: `555-${String(200 + (i % 800)).padStart(3, "0")}-${String(1000 + i).slice(-4)}`,
        dealValue: 500 + (i % 20) * 750,
        notes: i % 4 === 0 ? "Warm intro from partner." : null,
        stage,
        assigneeId,
        lastContactedAt: i % 5 === 0 ? new Date(Date.now() - i * 86400000) : null,
        nextAction: i % 6 === 0 ? "Follow up call" : null,
        nextActionAt: i % 6 === 0 ? new Date(Date.now() + 86400000) : null,
      },
    });
  }

  console.log("Seeded workspace, users, and 50 sample leads.");
  console.log("Login: demo@pipeline.local / demo1234");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
