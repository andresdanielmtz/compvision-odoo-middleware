import { Router } from "express";
import type { HealthResponse } from "../types.js";

const router = Router();

router.get("/", (_req, res) => {
  const body: HealthResponse = { status: "ok", uptime: process.uptime() };
  res.json(body);
});

export default router;
