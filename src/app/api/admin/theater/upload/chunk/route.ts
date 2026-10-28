import { NextResponse } from "next/server";
import { writeChunk } from "@/lib/theater-upload";
import { bad, guard } from "../../../_lib";
export const dynamic = "force-dynamic";
/** One chunk of a film, raw bytes in the body; ?id= names the upload and ?index= the chunk. Safe to repeat. */
export async function PUT(req: Request) {
  const g = await guard("theater"); if (g instanceof NextResponse) return g;
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") || "", index = Number(sp.get("index"));
  const data = Buffer.from(await req.arrayBuffer());
  const m = writeChunk(id, index, data);
  if ("error" in m) return bad(m.error, m.status ?? 400);
  return NextResponse.json({ received: m.received.length, chunks: m.chunks });
}
