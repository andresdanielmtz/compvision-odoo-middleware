import type { Server as SocketServer } from "socket.io";

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------
export type JobStatus = "processing" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  count: number;
  progress: number;
  videoPath: string;
  outputPath: string | null;
  error: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Processor messages (JSON lines from Python stdout)
// ---------------------------------------------------------------------------
export interface ProgressMessage {
  progress: number;
  frame: number;
  total: number;
  count: number;
}

export interface ResultMessage {
  count: number;
  output_path: string;
  total_frames: number;
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------
export interface JobResponse {
  id: string;
  status: JobStatus;
  count: number;
  progress: number;
  createdAt: string;
  error: string | null;
  outputUrl?: string;
}

export interface UploadResponse {
  jobId: string;
  status: string;
  message: string;
}

export interface CountResponse {
  totalCount: number;
  jobs: number;
}

export interface HealthResponse {
  status: string;
  uptime: number;
}

// ---------------------------------------------------------------------------
// Extend Express Request to carry Socket.IO reference
// ---------------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      io?: SocketServer;
    }
  }
}
