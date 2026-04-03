import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { PipelineStage, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

type JobStatus = "queued" | "running" | "done" | "error";

type ImportJob = {
  workspaceId: string;
  status: JobStatus;
  processed: number;
  total: number;
  created: number;
  errors: { row: number; message: string }[];
  errorMessage?: string;
};

const jobs = new Map<string, ImportJob>();

function norm(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function pickColumn(row: Record<string, string>, candidates: string[]): string {
  const keys = Object.keys(row);
  const map = new Map(keys.map((k) => [norm(k), row[k] ?? ""]));
  for (const c of candidates) {
    const v = map.get(norm(c));
    if (v !== undefined && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  for (const k of keys) {
    const nk = norm(k);
    for (const c of candidates) {
      if (nk.includes(norm(c)) || norm(c).includes(nk)) {
        const v = row[k];
        if (v && String(v).trim()) return String(v).trim();
      }
    }
  }
  return "";
}

function parseMoney(s: string): Prisma.Decimal {
  const cleaned = s.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(n);
}

router.post("/csv", upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: "Missing CSV file (field: file)" });
  }
  const jobId = randomUUID();
  jobs.set(jobId, {
    workspaceId: req.user!.workspaceId,
    status: "queued",
    processed: 0,
    total: 0,
    created: 0,
    errors: [],
  });

  const workspaceId = req.user!.workspaceId;
  const buffer = req.file.buffer;

  setImmediate(() => {
    void runImportJob(jobId, workspaceId, buffer);
  });

  return res.status(202).json({ jobId });
});

router.get("/csv/:jobId/status", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.workspaceId !== req.user!.workspaceId) {
    return res.status(404).json({ error: "Job not found" });
  }
  return res.json({
    status: job.status,
    processed: job.processed,
    total: job.total,
    created: job.created,
    errors: job.errors.slice(0, 100),
    errorMessage: job.errorMessage,
  });
});

async function runImportJob(jobId: string, workspaceId: string, buffer: Buffer) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "running";

  const text = buffer.toString("utf8");
  const lineCount = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  job.total = Math.max(lineCount - 1, 1);

  const BATCH = 400;
  let rowIndex = 0;
  let batch: Prisma.LeadCreateManyInput[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    await prisma.lead.createMany({ data: batch });
    job!.created += batch.length;
    batch = [];
  };

  try {
    const stream = Readable.from(buffer);
    const parser = parse({
      columns: (header: string[]) => header.map((h) => String(h).trim()),
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    });

    const pipeline = stream.pipe(parser);
    const iterable = pipeline as NodeJS.ReadableStream & AsyncIterable<Record<string, string>>;

    for await (const record of iterable) {
      rowIndex += 1;

      const title = pickColumn(record, [
        "title",
        "business",
        "business name",
        "company",
        "name",
      ]);
      if (!title) {
        job.errors.push({ row: rowIndex, message: "Missing title / business name" });
        job.processed = rowIndex;
        continue;
      }

      const contactName = pickColumn(record, ["contact name", "contact", "full name", "owner"]);
      const emailRaw = pickColumn(record, ["email", "e mail", "email address"]);
      const phone = pickColumn(record, ["phone", "mobile", "tel", "telephone"]);
      const dealRaw = pickColumn(record, ["deal value", "value", "amount", "deal"]);

      const email =
        emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)
          ? emailRaw
          : `import-${jobId.slice(0, 8)}-r${rowIndex}@placeholder.pipeline.local`;

      batch.push({
        workspaceId,
        title,
        contactName: contactName || null,
        email,
        phone: phone || null,
        dealValue: dealRaw ? parseMoney(dealRaw) : new Prisma.Decimal(0),
        stage: PipelineStage.NEW,
      });

      if (batch.length >= BATCH) {
        await flush();
      }
      job.processed = rowIndex;
    }

    await flush();
    job.status = "done";
    if (job.processed > job.total) job.total = job.processed;
  } catch (e) {
    job.status = "error";
    job.errorMessage = e instanceof Error ? e.message : "Import failed";
  }
}

export default router;
