import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getBooth } from "@/lib/economy";
import { canManageBooth } from "@/lib/booth-access";
import { listProducts, upsertProduct, deleteProduct } from "@/lib/products";

export const dynamic = "force-dynamic";

const Upsert = z.object({ id: z.string().max(24).optional(), title: z.string().max(80), blurb: z.string().max(240).nullable().optional(), priceCents: z.number().int().min(0).max(100_000_000), url: z.string().max(500) });

async function owned(id: string) {
  const u = await currentUser();
  if (!u) return { error: NextResponse.json({ error: "Sign in first" }, { status: 401 }) };
  const p = await getBooth(Number(id));
  if (!p || !(await canManageBooth(u.id, p))) return { error: NextResponse.json({ error: "Not your booth" }, { status: 403 }) };
  return { p };
}

/** The booth's shop. Anyone may read it; the owner sees each item's Buy presses too. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getBooth(Number(id));
  if (!p || !p.ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const u = await currentUser();
  return NextResponse.json({ products: await listProducts(p.id, !!u && (await canManageBooth(u.id, p))) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const o = await owned(id); if (o.error) return o.error;
  const parsed = Upsert.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try { return NextResponse.json({ product: await upsertProduct(o.p.id, parsed.data), products: await listProducts(o.p.id, true) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const o = await owned(id); if (o.error) return o.error;
  const pid = new URL(req.url).searchParams.get("product") ?? "";
  if (!/^[a-z0-9]{1,24}$/.test(pid)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await deleteProduct(o.p.id, pid);
  return NextResponse.json({ products: await listProducts(o.p.id, true) });
}
