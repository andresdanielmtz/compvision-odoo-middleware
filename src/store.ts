import type { Job } from "./types.js";

/**
 * Simple in-memory job store.
 * Replace with a database adapter if persistence is needed.
 */
class JobStore {
  private jobs = new Map<string, Job>();

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  set(id: string, job: Job): void {
    this.jobs.set(id, job);
  }

  getAll(): Job[] {
    return [...this.jobs.values()];
  }

  get size(): number {
    return this.jobs.size;
  }

  totalCount(): number {
    let total = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "done") total += job.count;
    }
    return total;
  }
}

export const jobStore = new JobStore();
