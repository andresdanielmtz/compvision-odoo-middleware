import { Router } from "express";
import { jobStore } from "../store.js";
import type { CountResponse } from "../types.js";

const router = Router();

router.get("/", (_req, res) => {
  const body: CountResponse = {
    totalCount: jobStore.totalCount(),
    jobs: jobStore.size,
  };
  res.json(body);
});

export default router;
