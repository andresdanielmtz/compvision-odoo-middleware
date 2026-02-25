const express = require("express");
const multer = require("multer");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PYTHON = path.join(__dirname, ".venv", "bin", "python");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Express + Socket.IO setup
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

// ---------------------------------------------------------------------------
// Multer – video upload
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = /mp4|avi|mov|mkv|webm/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype) || file.mimetype.startsWith("video/");
    cb(null, ext || mime);
  },
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

// ---------------------------------------------------------------------------
// In-memory job store
// ---------------------------------------------------------------------------
const jobs = new Map(); // jobId -> { status, count, progress, videoPath, outputPath, error }

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Upload video & start processing
app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file provided." });
  }

  const videoPath = req.file.path;
  const jobId = path.basename(videoPath, path.extname(videoPath));
  const linePos = parseFloat(req.body.linePosition) || 0.5;
  const minArea = parseInt(req.body.minArea, 10) || 1500;

  const job = {
    id: jobId,
    status: "processing",
    count: 0,
    progress: 0,
    videoPath,
    outputPath: null,
    error: null,
    createdAt: new Date().toISOString(),
  };
  jobs.set(jobId, job);

  // Spawn the Python processor
  const detectScript = path.join(__dirname, "processor", "detect.py");
  const proc = spawn(PYTHON, [
    detectScript,
    videoPath,
    "--line-pos", String(linePos),
    "--min-area", String(minArea),
  ]);

  proc.stdout.on("data", (data) => {
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        if (msg.progress !== undefined) {
          job.progress = msg.progress;
          job.count = msg.count;
          io.emit("progress", { jobId, progress: msg.progress, count: msg.count });
        }
        if (msg.output_path !== undefined) {
          // Final result
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

  proc.stderr.on("data", (data) => {
    console.error(`[processor:${jobId}] ${data.toString()}`);
  });

  proc.on("close", (code) => {
    if (code !== 0 && job.status !== "done") {
      job.status = "error";
      job.error = `Process exited with code ${code}`;
      io.emit("error", { jobId, error: job.error });
    }
  });

  res.status(202).json({
    jobId,
    status: "processing",
    message: "Video uploaded. Processing started.",
  });
});

// Get job status
app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  const response = {
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

// List all jobs
app.get("/api/jobs", (_req, res) => {
  const list = [...jobs.values()].map((j) => ({
    id: j.id,
    status: j.status,
    count: j.count,
    progress: j.progress,
    createdAt: j.createdAt,
  }));
  res.json(list);
});

// Get current global count (sum of all completed jobs)
app.get("/api/count", (_req, res) => {
  let total = 0;
  for (const job of jobs.values()) {
    if (job.status === "done") total += job.count;
  }
  res.json({ totalCount: total, jobs: jobs.size });
});

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------
io.on("connection", (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[socket] Client disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`\n  🚀  Conveyor Vision Server running at http://localhost:${PORT}\n`);
});