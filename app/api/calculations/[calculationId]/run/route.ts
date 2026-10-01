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
  revisionCalculationId?: string;
  expectedRunId?: string;
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
  const isRevision = body.revisionCalculationId !== undefined || body.expectedRunId !== undefined;
  if (isRevision && (!UUID_PATTERN.test(body.revisionCalculationId ?? "") || !UUID_PATTERN.test(body.expectedRunId ?? ""))) {
    return NextResponse.json({ error: "A revision requires its calculation and latest run IDs." }, { status: 400 });
  }

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
    typeof body.projectId !== "string" || !UUID_PATTERN.test(body.projectId) ||
    typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200 ||
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
    calculationRunnerFunction(linkedInputs.length > 0, isRevision),
    {
      body: {
        projectId: body.projectId,
        calculationId,
        title: body.title.trim(),
        inputs: body.inputs,
        linkedInputs,
        ...(isRevision ? { revisionCalculationId: body.revisionCalculationId, expectedRunId: body.expectedRunId } : {}),
      },
    },
  );

  const failureBody = error && "context" in error && error.context instanceof Response
    ? await error.context.clone().json().catch(() => data)
    : data;
  const failure = calculationRunFailure(error, failureBody, linkedInputs.length > 0, isRevision);
  if (failure) {
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }

  return NextResponse.json(data);
}
