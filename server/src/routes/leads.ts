import { Router } from "express";
import { z } from "zod";
import { PipelineStage, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { STAGE_ORDER } from "../constants/pipeline.js";
import { serializeLead } from "../lib/serialize.js";

const router = Router();
router.use(authMiddleware);

const createLeadSchema = z.object({
  title: z.string().min(1),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  dealValue: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional().nullable(),
  stage: z.nativeEnum(PipelineStage).optional(),
  assigneeId: z.string().optional().nullable(),
});

const updateLeadSchema = createLeadSchema.partial().extend({
  lastContactedAt: z.string().optional().nullable(),
  nextAction: z.string().optional().nullable(),
  nextActionAt: z.string().optional().nullable(),
});

function toDecimal(v: unknown): Prisma.Decimal {
  if (v === undefined || v === null || v === "") {
    return new Prisma.Decimal(0);
  }
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (Number.isNaN(n)) {
    return new Prisma.Decimal(0);
  }
  return new Prisma.Decimal(n);
}

const leadInclude = { assignee: true } as const;

router.get("/board", async (req, res) => {
  const workspaceId = req.user!.workspaceId;
  const perStage = Math.min(parseInt(String(req.query.perStage ?? "200"), 10) || 200, 500);
  const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
  const skip = (page - 1) * perStage;

  const stages = await Promise.all(
    STAGE_ORDER.map(async (stage) => {
      const [leads, total] = await Promise.all([
        prisma.lead.findMany({
          where: { workspaceId, stage },
          orderBy: { updatedAt: "desc" },
          take: perStage,
          skip,
          include: leadInclude,
        }),
        prisma.lead.count({ where: { workspaceId, stage } }),
      ]);
      return {
        stage,
        total,
        page,
        perStage,
        leads: leads.map(serializeLead),
      };
    }),
  );

  return res.json({ stages });
});

const bulkSchema = z.object({
  leadIds: z.array(z.string()).min(1),
  stage: z.nativeEnum(PipelineStage).optional(),
  assigneeId: z.string().nullable().optional(),
});

router.patch("/bulk/update", async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { leadIds, stage, assigneeId } = parsed.data;
  if (stage === undefined && assigneeId === undefined) {
    return res.status(400).json({ error: "Provide stage and/or assigneeId" });
  }
  const data: Prisma.LeadUpdateManyMutationInput = {};
  if (stage !== undefined) data.stage = stage;
  if (assigneeId !== undefined) data.assigneeId = assigneeId;

  const result = await prisma.lead.updateMany({
    where: { workspaceId: req.user!.workspaceId, id: { in: leadIds } },
    data,
  });
  return res.json({ updated: result.count });
});

const quickAddSchema = z.object({
  lines: z.string().min(1),
});

router.post("/quick-add", async (req, res) => {
  const parsed = quickAddSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const titles = parsed.data.lines
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (titles.length === 0) {
    return res.status(400).json({ error: "No business names provided" });
  }
  if (titles.length > 5000) {
    return res.status(400).json({ error: "Maximum 5000 lines per request" });
  }
  const workspaceId = req.user!.workspaceId;
  const batchSize = 200;
  let created = 0;
  for (let i = 0; i < titles.length; i += batchSize) {
    const chunk = titles.slice(i, i + batchSize);
    await prisma.$transaction(
      chunk.map((title, idx) =>
        prisma.lead.create({
          data: {
            workspaceId,
            title,
            stage: PipelineStage.NEW,
            email: `placeholder-${Date.now()}-${i + idx}@import.local`,
          },
        }),
      ),
    );
    created += chunk.length;
  }
  return res.json({ created });
});

router.get("/:id", async (req, res) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, workspaceId: req.user!.workspaceId },
    include: {
      assignee: true,
      activities: { include: { author: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  const { dealValue, activities, ...rest } = lead;
  return res.json({
    ...rest,
    dealValue: dealValue.toString(),
    assignee: lead.assignee
      ? {
          id: lead.assignee.id,
          name: lead.assignee.name,
          email: lead.assignee.email,
        }
      : null,
    activities: activities.map((a) => ({
      id: a.id,
      content: a.content,
      createdAt: a.createdAt.toISOString(),
      author: a.author ? { id: a.author.id, name: a.author.name } : null,
    })),
  });
});

router.post("/", async (req, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const body = parsed.data;
  const lead = await prisma.lead.create({
    data: {
      workspaceId: req.user!.workspaceId,
      title: body.title,
      contactName: body.contactName ?? null,
      email: body.email || null,
      phone: body.phone ?? null,
      dealValue: toDecimal(body.dealValue),
      notes: body.notes ?? null,
      stage: body.stage ?? PipelineStage.NEW,
      assigneeId: body.assigneeId ?? null,
    },
    include: leadInclude,
  });
  return res.status(201).json(serializeLead(lead));
});

router.patch("/:id", async (req, res) => {
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const body = parsed.data;
  const existing = await prisma.lead.findFirst({
    where: { id: req.params.id, workspaceId: req.user!.workspaceId },
  });
  if (!existing) {
    return res.status(404).json({ error: "Lead not found" });
  }
  const data: Prisma.LeadUncheckedUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.contactName !== undefined) data.contactName = body.contactName;
  if (body.email !== undefined) data.email = body.email || null;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.dealValue !== undefined) data.dealValue = toDecimal(body.dealValue);
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.stage !== undefined) data.stage = body.stage;
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
  if (body.lastContactedAt !== undefined) {
    const v = body.lastContactedAt?.trim();
    data.lastContactedAt = v ? new Date(v) : null;
  }
  if (body.nextAction !== undefined) data.nextAction = body.nextAction;
  if (body.nextActionAt !== undefined) {
    const v = body.nextActionAt?.trim();
    data.nextActionAt = v ? new Date(v) : null;
  }
  const lead = await prisma.lead.update({
    where: { id: req.params.id },
    data,
    include: leadInclude,
  });
  return res.json(serializeLead(lead));
});

router.delete("/:id", async (req, res) => {
  const result = await prisma.lead.deleteMany({
    where: { id: req.params.id, workspaceId: req.user!.workspaceId },
  });
  if (result.count === 0) {
    return res.status(404).json({ error: "Lead not found" });
  }
  return res.status(204).send();
});

const noteSchema = z.object({
  content: z.string().min(1),
  touchLastContacted: z.boolean().optional(),
});

router.post("/:id/notes", async (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, workspaceId: req.user!.workspaceId },
  });
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  const note = await prisma.note.create({
    data: {
      leadId: lead.id,
      content: parsed.data.content,
      authorId: req.user!.sub,
    },
  });
  if (parsed.data.touchLastContacted) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastContactedAt: new Date() },
    });
  }
  return res.status(201).json({
    id: note.id,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
  });
});

export default router;
