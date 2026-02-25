"""
Conveyor Belt Item Counter
==========================
Processes a video file and counts items crossing a configurable counting line.

Usage:
    python detect.py <video_path> [--output <output_path>] [--line-pos 0.5]

Outputs:
    - Annotated video saved to <output_path> (default: uploads/<name>_processed.mp4)
    - Final count printed as JSON to stdout: {"count": N}
"""

import sys
import os
import json
import argparse
import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Tracker – simple centroid tracker to avoid double-counting
# ---------------------------------------------------------------------------
class CentroidTracker:
    """Track objects by centroid proximity across frames."""

    def __init__(self, max_disappeared: int = 15):
        self.next_id = 0
        self.objects: dict[int, tuple[int, int]] = {}
        self.disappeared: dict[int, int] = {}
        self.max_disappeared = max_disappeared

    def register(self, centroid: tuple[int, int]) -> int:
        obj_id = self.next_id
        self.objects[obj_id] = centroid
        self.disappeared[obj_id] = 0
        self.next_id += 1
        return obj_id

    def deregister(self, obj_id: int):
        del self.objects[obj_id]
        del self.disappeared[obj_id]

    def update(self, centroids: list[tuple[int, int]]) -> dict[int, tuple[int, int]]:
        # No detections – mark all existing as disappeared
        if len(centroids) == 0:
            for obj_id in list(self.disappeared.keys()):
                self.disappeared[obj_id] += 1
                if self.disappeared[obj_id] > self.max_disappeared:
                    self.deregister(obj_id)
            return self.objects

        # No existing objects – register all
        if len(self.objects) == 0:
            for c in centroids:
                self.register(c)
            return self.objects

        obj_ids = list(self.objects.keys())
        obj_centroids = list(self.objects.values())

        # Compute distance matrix
        D = np.zeros((len(obj_centroids), len(centroids)), dtype="float")
        for i, oc in enumerate(obj_centroids):
            for j, cc in enumerate(centroids):
                D[i, j] = np.linalg.norm(np.array(oc) - np.array(cc))

        # Greedy assignment (rows = existing, cols = new detections)
        rows = D.min(axis=1).argsort()
        cols = D.argmin(axis=1)[rows]

        used_rows: set[int] = set()
        used_cols: set[int] = set()

        for row, col in zip(rows, cols):
            if row in used_rows or col in used_cols:
                continue
            if D[row, col] > 80:  # max match distance (pixels)
                continue
            obj_id = obj_ids[row]
            self.objects[obj_id] = centroids[col]
            self.disappeared[obj_id] = 0
            used_rows.add(row)
            used_cols.add(col)

        unused_rows = set(range(len(obj_centroids))) - used_rows
        unused_cols = set(range(len(centroids))) - used_cols

        for row in unused_rows:
            obj_id = obj_ids[row]
            self.disappeared[obj_id] += 1
            if self.disappeared[obj_id] > self.max_disappeared:
                self.deregister(obj_id)

        for col in unused_cols:
            self.register(centroids[col])

        return self.objects


# ---------------------------------------------------------------------------
# Main processing pipeline
# ---------------------------------------------------------------------------
def process_video(video_path: str, output_path: str | None = None, line_position: float = 0.5,
                  min_area: int = 1500, progress_callback=None):
    """
    Process a video, count items crossing the counting line.

    Args:
        video_path:        Path to input video file.
        output_path:       Path to save annotated output video (optional).
        line_position:     Vertical position of the counting line as a fraction (0-1).
        min_area:          Minimum contour area (px²) to consider as an item.
        progress_callback: Optional callable(frame_num, total_frames, current_count).

    Returns:
        dict with keys: count, output_path
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {video_path}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Counting line (horizontal)
    line_y = int(height * line_position)

    # Output video writer
    if output_path is None:
        base, ext = os.path.splitext(video_path)
        output_path = f"{base}_processed.mp4"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    # Background subtractor
    bg_subtractor = cv2.createBackgroundSubtractorMOG2(
        history=500, varThreshold=50, detectShadows=True
    )

    tracker = CentroidTracker(max_disappeared=int(fps * 0.5))
    counted_ids: set[int] = set()  # IDs that already crossed the line
    prev_positions: dict[int, int] = {}  # obj_id -> previous y
    item_count = 0
    frame_num = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_num += 1

        # ----- Pre-processing -----
        blurred = cv2.GaussianBlur(frame, (11, 11), 0)
        fg_mask = bg_subtractor.apply(blurred)

        # Remove shadows (shadow pixels = 127 in MOG2)
        _, fg_mask = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)

        # Morphology to clean noise
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel, iterations=1)
        fg_mask = cv2.dilate(fg_mask, kernel, iterations=2)

        # ----- Contour detection -----
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        centroids: list[tuple[int, int]] = []

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            cx, cy = x + w // 2, y + h // 2
            centroids.append((cx, cy))

            # Draw bounding box
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            cv2.circle(frame, (cx, cy), 4, (0, 0, 255), -1)

        # ----- Tracking & counting -----
        objects = tracker.update(centroids)

        for obj_id, (cx, cy) in objects.items():
            if obj_id in counted_ids:
                continue

            prev_y = prev_positions.get(obj_id)
            if prev_y is not None:
                # Check if the object crossed the line (either direction)
                if (prev_y < line_y <= cy) or (prev_y > line_y >= cy):
                    item_count += 1
                    counted_ids.add(obj_id)

            prev_positions[obj_id] = cy

        # Clean prev_positions for deregistered objects
        active_ids = set(objects.keys())
        for oid in list(prev_positions.keys()):
            if oid not in active_ids:
                del prev_positions[oid]

        # ----- Draw annotations -----
        cv2.line(frame, (0, line_y), (width, line_y), (0, 0, 255), 2)
        cv2.putText(frame, f"Count: {item_count}", (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
        cv2.putText(frame, "COUNTING LINE", (10, line_y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        writer.write(frame)

        if progress_callback and frame_num % 10 == 0:
            progress_callback(frame_num, total_frames, item_count)

    cap.release()
    writer.release()

    return {"count": item_count, "output_path": output_path, "total_frames": frame_num}


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Conveyor belt item counter")
    parser.add_argument("video", help="Path to the input video file")
    parser.add_argument("--output", "-o", help="Path for the annotated output video")
    parser.add_argument("--line-pos", type=float, default=0.5,
                        help="Counting line vertical position (0-1, default 0.5)")
    parser.add_argument("--min-area", type=int, default=1500,
                        help="Minimum contour area in pixels² (default 1500)")
    args = parser.parse_args()

    def on_progress(frame, total, count):
        pct = int(frame / total * 100) if total > 0 else 0
        print(json.dumps({"progress": pct, "frame": frame, "total": total, "count": count}),
              flush=True)

    result = process_video(
        video_path=args.video,
        output_path=args.output,
        line_position=args.line_pos,
        min_area=args.min_area,
        progress_callback=on_progress,
    )

    # Final result as the last JSON line
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
