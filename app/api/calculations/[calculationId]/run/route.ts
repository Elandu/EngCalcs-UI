import { NextResponse } from "next/server";

import type { Json } from "@/lib/database.types";
import {
  calculationRunFailure,
  calculationRunnerFunction,
} from "@/lib/calculation-run-dispatch";
import { createClient } from "@/lib/supabase/server";

type RunRequest = {
  projectId?: string;
  title?: string;
  inputs?: Json;
  linkedInputs?: LinkedInputRequest[];
};

type LinkedInputRequest = {
  sourceCalculationId: string;
  sourceRunId: string;
  sourceOutputPath: string;
  targetInputPath: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validPointer(value: unknown): value is string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    value.length <= 1024 &&
    !/~(?![01])/.test(value) &&
    value.split("/").length <= 33;
}

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ calculationId: string }> },
) {
  const { calculationId } = await context.params;
  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const body = payload as RunRequest;
  const linkedInputs = body.linkedInputs ?? [];

  if (
    !Array.isArray(linkedInputs) ||
    linkedInputs.length > 50 ||
    linkedInputs.some((link) =>
      !link ||
      !UUID_PATTERN.test(link.sourceCalculationId) ||
      !UUID_PATTERN.test(link.sourceRunId) ||
      !validPointer(link.sourceOutputPath) ||
      !validPointer(link.targetInputPath)
    ) ||
    new Set(linkedInputs.map((link) => link.targetInputPath)).size !== linkedInputs.length
  ) {
    return NextResponse.json(
      { error: "Linked inputs must identify unique source runs and JSON Pointer paths." },
      { status: 400 },
    );
  }

  if (
    !body.projectId ||
    !body.title?.trim() ||
    !body.inputs ||
    typeof body.inputs !== "object" ||
    Array.isArray(body.inputs)
  ) {
    return NextResponse.json(
      { error: "projectId, title and inputs are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.functions.invoke(
    calculationRunnerFunction(linkedInputs.length > 0),
    {
      body: {
        projectId: body.projectId,
        calculationId,
        title: body.title.trim(),
        inputs: body.inputs,
        linkedInputs,
      },
    },
  );

  const failure = calculationRunFailure(error, data, linkedInputs.length > 0);
  if (failure) {
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }

  return NextResponse.json(data);
}
