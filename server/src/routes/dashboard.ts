import { Router } from "express";
import { PipelineStage } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { STAGE_ORDER, STAGE_LABELS, STAGE_WEIGHT } from "../constants/pipeline.js";

const router = Router();
router.use(authMiddleware);

router.get("/stats", async (req, res) => {
  const workspaceId = req.user!.workspaceId;

  const [total, byStageRaw, sumRows] = await Promise.all([
    prisma.lead.count({ where: { workspaceId } }),
    prisma.lead.groupBy({
      by: ["stage"],
      where: { workspaceId },
      _count: { id: true },
    }),
    prisma.lead.groupBy({
      by: ["stage"],
      where: { workspaceId },
      _sum: { dealValue: true },
    }),
  ]);

  const countByStage = Object.fromEntries(
    STAGE_ORDER.map((s) => [s, 0]),
  ) as Record<PipelineStage, number>;
  for (const row of byStageRaw) {
    countByStage[row.stage] = row._count.id;
  }

  const sumByStage: Partial<Record<PipelineStage, string>> = {};
  for (const row of sumRows) {
    sumByStage[row.stage] = (row._sum.dealValue ?? 0).toString();
  }

  let weightedRevenue = 0;
  for (const stage of STAGE_ORDER) {
    const sum = parseFloat(sumByStage[stage] ?? "0");
    weightedRevenue += sum * STAGE_WEIGHT[stage];
  }

  const won = countByStage[PipelineStage.CLOSED_WON];
  const lost = countByStage[PipelineStage.CLOSED_LOST];
  const closed = won + lost;
  const conversionRate = closed > 0 ? won / closed : null;

  const qualifiedPlus = [
    PipelineStage.QUALIFIED,
    PipelineStage.APPOINTMENT_BOOKED,
    PipelineStage.CLOSED_WON,
  ].reduce((acc, s) => acc + countByStage[s], 0);
  const newLeads = countByStage[PipelineStage.NEW];
  const qualificationRate = total > 0 ? qualifiedPlus / total : null;

  return res.json({
    totalLeads: total,
    leadsPerStage: STAGE_ORDER.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      count: countByStage[stage],
      dealSum: sumByStage[stage] ?? "0",
      weightPercent: Math.round(STAGE_WEIGHT[stage] * 100),
    })),
    estimatedRevenue: weightedRevenue.toFixed(2),
    conversionRates: {
      wonVsClosed: conversionRate !== null ? Number((conversionRate * 100).toFixed(1)) : null,
      qualifiedPipelineShare:
        qualificationRate !== null ? Number((qualificationRate * 100).toFixed(1)) : null,
    },
  });
});

export default router;
