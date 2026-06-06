/**
 * Job queue hook — localStorage-backed job lifecycle + execution tracking.
 * Jobs execute only when app is open, via existing requestApproval() flow.
 */
import { useState, useCallback, useEffect } from "react";

export interface Job {
  id: string;
  name: string;
  intent: string;
  type: "recurring" | "oneshot";
  schedule: { intervalMs: number; nextRun: number };
  action: { type: string; params: Record<string, unknown> };
  status: "active" | "paused" | "completed" | "failed";
  lastRun: number | null;
  runCount: number;
  history: { ts: number; status: "approved" | "rejected" | "failed"; txHash?: string; error?: string }[];
  createdAt: number;
  /** Current step index for multi-hop jobs (0-based). */
  multiHopProgress?: number;
}

const STORAGE_KEY = "matterhorn_job_queue";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useJobQueue() {
  const [jobs, setJobs] = useState<Job[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Job[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }, [jobs]);

  const add = useCallback((job: Omit<Job, "id" | "createdAt" | "runCount" | "lastRun" | "history">) => {
    const newJob: Job = {
      ...job,
      id: generateId(),
      createdAt: Date.now(),
      runCount: 0,
      lastRun: null,
      history: [],
    };
    setJobs((prev) => [...prev, newJob]);
    return newJob.id;
  }, []);

  const update = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const remove = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const pause = useCallback((id: string) => {
    update(id, { status: "paused" });
  }, [update]);

  const resume = useCallback((id: string) => {
    update(id, { status: "active" });
  }, [update]);

  const logRun = useCallback((id: string, entry: Job["history"][number]) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== id) return j;
        const newHistory = [entry, ...j.history].slice(0, 20);
        const newRunCount = j.runCount + 1;
        const newLastRun = entry.ts;
        const newStatus = entry.status === "rejected" ? "paused" : j.status;
        const newNextRun = j.type === "recurring" ? entry.ts + j.schedule.intervalMs : j.schedule.nextRun;
        return {
          ...j,
          history: newHistory,
          runCount: newRunCount,
          lastRun: newLastRun,
          status: newStatus,
          schedule: { ...j.schedule, nextRun: newNextRun },
        };
      })
    );
  }, []);

  const pendingJobs = jobs.filter((j) => j.status === "active" && j.schedule.nextRun <= Date.now());

  return { jobs, add, update, remove, pause, resume, logRun, pendingJobs };
}
