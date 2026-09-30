// Search the imported records using the same visibility and filters as the list.
import { GET as listImportedCandidates } from "../imported-candidates/route";
export async function GET(request: Request) {
  if (!(new URL(request.url).searchParams.get("q") ?? "").trim()) {
    return Response.json({ error: "Missing q" }, { status: 400 });
  }
  return listImportedCandidates(request);
}
