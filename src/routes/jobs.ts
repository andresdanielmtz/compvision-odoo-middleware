import { Router } from "express";
import path from "path";
import { jobStore } from "../store.js";
import type { JobResponse, CountResponse } from "../types.js";

const router = Router();

// List all jobs
router.get("/", (_req, res) => {
  const list = jobStore.getAll().map((j) => ({
    id: j.id,
    status: j.status,
    count: j.count,
    progress: j.progress,
    createdAt: j.createdAt,
  }));
  res.json(list);
});

// Get job by ID
router.get("/:id", (req, res) => {
  const job = jobStore.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const response: JobResponse = {
    id: job.id,
    status: job.status,
    count: job.count,
    progress: job.progress,
    createdAt: job.createdAt,
    error: job.error,
  };

  if (job.outputPath) {
    response.outputUrl = `/uploads/${path.basename(job.outputPath)}`;
  }

  res.json(response);
});

export default router;
