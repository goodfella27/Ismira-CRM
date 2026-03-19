import { NextRequest, NextResponse } from "next/server";
import {
  breezyFetch,
  findCandidatesByEmail,
  getBreezyEnv,
  requireBreezyIds,
} from "@/lib/breezy";
import { mailerliteFetch } from "@/lib/mailerlite";

function extractCandidates(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.candidates)) return obj.candidates;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return [] as unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFirstString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function buildCandidatePayload(subscriber: Record<string, unknown>) {
  const fields = isRecord(subscriber.fields) ? subscriber.fields : {};
  const firstName = pickFirstString(fields.name, fields.first_name);
  const lastName = pickFirstString(fields.last_name, fields.surname);
  const fullName = pickFirstString(
    firstName && lastName ? `${firstName} ${lastName}` : undefined,
    subscriber.name,
    subscriber.email
  );

  const phone = pickFirstString(fields.phone, subscriber.phone);
  const email = pickFirstString(subscriber.email);

  if (!email) {
    throw new Error("Subscriber email is missing");
  }

  return {
    name: fullName ?? email,
    email_address: email,
    phone_number: phone,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { subscriberId?: string };
    if (!body.subscriberId) {
      return NextResponse.json(
        { error: "Missing subscriberId" },
        { status: 400 }
      );
    }

    const env = getBreezyEnv();
    if (!env.apiToken && !(env.email && env.password)) {
      return NextResponse.json(
        { error: "Missing Breezy credentials" },
        { status: 400 }
      );
    }

    if (!env.companyId || !env.positionId) {
      return NextResponse.json(
        { error: "Missing BREEZY_COMPANY_ID or BREEZY_POSITION_ID" },
        { status: 400 }
      );
    }

    const { companyId, positionId } = requireBreezyIds();

    const subscriberRes = await mailerliteFetch(
      `https://connect.mailerlite.com/api/subscribers/${body.subscriberId}`
    );
    const subscriberJson = await subscriberRes.json();
    if (!subscriberRes.ok) {
      return NextResponse.json(
        { error: "MailerLite request failed", details: subscriberJson },
        { status: subscriberRes.status }
      );
    }

    const subscriber = subscriberJson?.data as Record<string, unknown> | undefined;
    if (!subscriber) {
      return NextResponse.json(
        { error: "Subscriber not found" },
        { status: 404 }
      );
    }

    const candidatePayload = buildCandidatePayload(subscriber);

    const searchResult = await findCandidatesByEmail(
      candidatePayload.email_address,
      companyId
    );
    if (searchResult.error) {
      return NextResponse.json(
        {
          error: "Breezy candidate search failed",
          details: searchResult.error,
        },
        { status: 400 }
      );
    }

    const candidateId = searchResult.candidateId;

    if (candidateId) {
      const updateUrl = `https://api.breezy.hr/v3/company/${companyId}/position/${positionId}/candidate/${candidateId}`;
      const updateRes = await breezyFetch(updateUrl, {
        method: "PUT",
        body: JSON.stringify(candidatePayload),
      });
      const updateBody = await updateRes.json().catch(() => null);

      if (!updateRes.ok) {
        return NextResponse.json(
          {
            error: "Breezy update failed",
            details: updateBody,
          },
          { status: updateRes.status }
        );
      }

      return NextResponse.json({
        action: "updated",
        candidateId,
        payload: candidatePayload,
      });
    }

    const createUrl = `https://api.breezy.hr/v3/company/${companyId}/position/${positionId}/candidates`;
    const createRes = await breezyFetch(createUrl, {
      method: "POST",
      body: JSON.stringify(candidatePayload),
    });
    const createBody = await createRes.json().catch(() => null);

    if (!createRes.ok) {
      return NextResponse.json(
        {
          error: "Breezy create failed",
          details: createBody,
        },
        { status: createRes.status }
      );
    }

    const createdId =
      (createBody?._id as string | undefined) ??
      (createBody?.id as string | undefined) ??
      (createBody?.data?._id as string | undefined) ??
      (createBody?.data?.id as string | undefined);

    return NextResponse.json({
      action: "created",
      candidateId: createdId ?? null,
      payload: candidatePayload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
