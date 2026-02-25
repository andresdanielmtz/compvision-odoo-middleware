import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { Server } from "socket.io";

import { PORT, UPLOAD_DIR } from "./config.js";
import { registerSocketHandlers } from "./socket.js";

// Routes
import healthRouter from "./routes/health.js";
import jobsRouter from "./routes/jobs.js";
import countRouter from "./routes/count.js";
import { createUploadRouter } from "./routes/upload.js";

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

// Routes
app.use("/api/health", healthRouter);
app.use("/api/upload", createUploadRouter(io));
app.use("/api/jobs", jobsRouter);
app.use("/api/count", countRouter);

// Socket.IO
registerSocketHandlers(io);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`\n  🚀  Conveyor Vision Server running at http://localhost:${PORT}\n`);
});

export { app, server, io };
