# Conveyor Vision — Item Counter

Computer vision system that detects and counts items passing through a conveyor belt (machine band) from uploaded video.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser (public/index.html)                    │
│  - Upload video                                 │
│  - Real-time progress via Socket.IO             │
│  - View annotated result video + count          │
└────────────────┬────────────────────────────────┘
                 │ HTTP + WebSocket
┌────────────────▼────────────────────────────────┐
│  Express Server (index.js)                      │
│  - POST /api/upload — receive video             │
│  - GET  /api/jobs/:id — job status              │
│  - GET  /api/jobs — list all jobs               │
│  - GET  /api/count — global item total          │
│  - Socket.IO — live progress & results          │
└────────────────┬────────────────────────────────┘
                 │ spawns child process
┌────────────────▼────────────────────────────────┐
│  Python Processor (processor/detect.py)         │
│  - Background subtraction (MOG2)                │
│  - Contour detection → bounding boxes           │
│  - Centroid tracking across frames              │
│  - Counts items crossing a horizontal line      │
│  - Outputs annotated video + JSON count         │
└─────────────────────────────────────────────────┘
```

## How the detection works

1. **Background subtraction** (MOG2) isolates moving objects from the static conveyor.
2. **Morphological operations** clean noise from the foreground mask.
3. **Contour detection** finds object blobs; small contours are filtered out by `min_area`.
4. **Centroid tracking** assigns persistent IDs to objects across frames using nearest-neighbor matching.
5. **Counting line** — a horizontal line at a configurable vertical position. When a tracked object's centroid crosses this line, the counter increments. Each object is counted exactly once.

## Setup

```bash
# 1. Install Node.js dependencies
npm install

# 2. Create Python venv & install deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
npm start
# → http://localhost:3000
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload video (multipart, field: `video`). Optional body fields: `linePosition` (0-1), `minArea` (px²). Returns `{ jobId }`. |
| `GET` | `/api/jobs/:id` | Get job status, count, and output video URL. |
| `GET` | `/api/jobs` | List all jobs. |
| `GET` | `/api/count` | Total items counted across all completed jobs. |
| `GET` | `/api/health` | Server health check. |

### Socket.IO Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `progress` | server → client | `{ jobId, progress, count }` |
| `done` | server → client | `{ jobId, count, outputUrl }` |
| `error` | server → client | `{ jobId, error }` |

## CLI (standalone processor)

```bash
source .venv/bin/activate
python processor/detect.py video.mp4 --line-pos 0.5 --min-area 1500
```
