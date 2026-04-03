import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { signToken, authMiddleware } from "../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  workspaceName: z.string().min(1).default("My Workspace"),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, name, workspaceName } = parsed.data;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const workspace = await prisma.workspace.create({
      data: { name: workspaceName },
    });
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name ?? null,
        workspaceId: workspace.id,
      },
    });
    const token = signToken({
      sub: user.id,
      workspaceId: user.workspaceId,
      email: user.email,
    });
    return res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, workspaceId: user.workspaceId },
    });
  } catch (e) {
    console.error("register", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return res.status(409).json({ error: "Email already registered" });
      }
      if (e.code === "P1001") {
        return res.status(503).json({
          error:
            "Cannot reach PostgreSQL. Check DATABASE_URL and that the database server is running.",
        });
      }
    }
    if (e instanceof Prisma.PrismaClientInitializationError) {
      return res.status(503).json({
        error:
          "Database connection failed. Check DATABASE_URL in .env and that PostgreSQL is running.",
      });
    }
    return res.status(500).json({
      error:
        "Could not create account. If this persists, confirm the database is migrated (npm run db:push or db:migrate).",
    });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = signToken({
    sub: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
  });
  return res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, workspaceId: user.workspaceId },
  });
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { workspace: true },
  });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    workspaceId: user.workspaceId,
    workspaceName: user.workspace.name,
  });
});

export default router;
