import path from "path";
import fs from "fs";

export const PORT = Number(process.env.PORT) || 3000;
export const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
export const PYTHON = path.join(__dirname, "..", ".venv", "bin", "python");
export const DETECT_SCRIPT = path.join(__dirname, "..", "processor", "detect.py");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
