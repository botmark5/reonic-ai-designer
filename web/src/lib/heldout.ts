/**
 * Held-out projects for the reality check. SERVER ONLY.
 * Source: the engine's locked test set (engine/artifacts/test_ids.json, generated from the Reonic data, never committed)
 * and its curated demo set (engine/artifacts/demo_projects.json). On a host without those files, set
 * HELDOUT_PROJECT_IDS (comma-separated) instead. Directory override: ENGINE_ARTIFACTS_DIR.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface DemoProject {
  role: string;
  why: string;
  project_id: string;
}

const dir = () => process.env.ENGINE_ARTIFACTS_DIR || path.resolve(process.cwd(), "../engine/artifacts");

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(dir(), name), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function heldOutIds(): Promise<string[]> {
  const env = process.env.HELDOUT_PROJECT_IDS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (env?.length) return env;
  const t = await readJson<{ test_project_ids?: string[] }>("test_ids.json");
  return t?.test_project_ids ?? [];
}

export async function demoProjects(): Promise<DemoProject[]> {
  const d = await readJson<{ projects?: DemoProject[] }>("demo_projects.json");
  return (d?.projects ?? []).map(({ role, why, project_id }) => ({ role, why, project_id }));
}
