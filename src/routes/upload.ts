import { Router } from "express";
import path from "path";
import { spawn } from "child_process";
import type { Server as SocketServer } from "socket.io";
import { upload } from "../middleware/upload.js";
import { jobStore } from "../store.js";
import { PYTHON, DETECT_SCRIPT } from "../config.js";
import type { Job, ProgressMessage, ResultMessage, UploadResponse } from "../types.js";

export function createUploadRouter(io: SocketServer): Router {
  const router = Router();

  router.post("/", upload.single("video"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No video file provided." });
      return;
    }

    const videoPath = req.file.path;
    const jobId = path.basename(videoPath, path.extname(videoPath));
    const linePos = parseFloat(req.body.linePosition) || 0.5;
    const minArea = parseInt(req.body.minArea, 10) || 1500;

    const job: Job = {
      id: jobId,
      status: "processing",
      count: 0,
      progress: 0,
      videoPath,
      outputPath: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    jobStore.set(jobId, job);

    // Spawn the Python processor
    const proc = spawn(PYTHON, [
      DETECT_SCRIPT,
      videoPath,
      "--line-pos",
      String(linePos),
      "--min-area",
      String(minArea),
    ]);

    proc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as ProgressMessage & Partial<ResultMessage>;

          if (msg.progress !== undefined) {
            job.progress = msg.progress;
            job.count = msg.count;
            io.emit("progress", { jobId, progress: msg.progress, count: msg.count });
          }

          if (msg.output_path !== undefined) {
            job.status = "done";
            job.count = msg.count;
            job.outputPath = msg.output_path;
            job.progress = 100;
            io.emit("done", {
              jobId,
              count: msg.count,
              outputUrl: `/uploads/${path.basename(msg.output_path)}`,
            });
          }
        } catch {
          // not JSON, ignore
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      console.error(`[processor:${jobId}] ${data.toString()}`);
    });

    proc.on("close", (code) => {
      if (code !== 0 && job.status !== "done") {
        job.status = "error";
        job.error = `Process exited with code ${code}`;
        io.emit("error", { jobId, error: job.error });
      }
    });

    const body: UploadResponse = {
      jobId,
      status: "processing",
      message: "Video uploaded. Processing started.",
    };
    res.status(202).json(body);
  });

  return router;
}
