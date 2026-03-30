import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const users = await prisma.user.findMany({
    where: { workspaceId: req.user!.workspaceId },
    select: { id: true, email: true, name: true },
    orderBy: { email: "asc" },
  });
  return res.json({ users });
});

export default router;
