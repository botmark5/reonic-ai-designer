import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { LiveCall } from "@/components/planner/live-call";

export const metadata: Metadata = { title: "Live call · Reonic AI Designer" };

/** Planner-side big screen for an incoming voice-agent call (mockup 1). */
export default function LivePage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <Live />
    </Suspense>
  );
}

async function Live() {
  await connection(); // time-based UI (call clock): render per request
  return <LiveCall />;
}
