"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useJson, api, useToast, PageHead, Badge, Money, DateTime, ConfirmButton, Field, Input, Checkbox, Empty } from "./shared";
import { ADMIN_AREAS, parsePermissions, type AdminArea } from "@/lib/permissions";
interface User { permissions: string | null; id: string; email: string; displayName: string | null; handle: string | null; referralCode: string; referredBy: string | null; emailVerifiedAt: number | null; referralPaidAt: number | null; creditCents: number; coins: number; streak: number; notifyEmail: boolean; dcPaymentMethodId: string | null; cardIp: string | null; isAdmin: boolean; createdAt: number; lastSeenAt: number | null }
interface Resp { user: User; booths: { id: number; name: string | null; tier: string; valueCents: number; floors: number; hidden: boolean; claimedAt: number | null; subscriptionStatus: string | null }[]; txs: { id: string; kind: string; status: string; amountCents: number; boothId: number; createdAt: number; buyerId: string | null }[]; coins: { id: string; delta: number; reason: string; ref: string | null; createdAt: number }[]; mail: { id: string; direction: string; subject: string; status: string | null; createdAt: number }[]; sessions: number }
export default function UserDetail({ id }: { id: string }) {
  const d = useJson<Resp>(`/api/admin/users/${id}`);
  const [form, setForm] = useState<{ email: string; displayName: string; handle: string; notifyEmail: boolean } | null>(null);
  const [perms, setPerms] = useState<AdminArea[] | null>(null);
  const [grant, setGrant] = useState({ creditDeltaCents: "", coinsDelta: "", reason: "" });
  const toast = useToast(); const router = useRouter();
  const u = d.data?.user;
  const f = form ?? (u ? { email: u.email, displayName: u.displayName ?? "", handle: u.handle ?? "", notifyEmail: u.notifyEmail } : null);
  const areas = perms ?? (u ? parsePermissions(u.permissions) : []);
  const patch = async (json: Record<string, unknown>, msg = "Saved") => { try { await api(`/api/admin/users/${id}`, { method: "PATCH", json }); toast.ok(msg); d.reload(); setForm(null); } catch (e) { toast.err(e); } };
  if (d.error) return <div className="admNote admNote--err">{d.error}</div>;
  if (!u || !f) return <div className="admMuted">Loading…</div>;
  return (
    <>
      {toast.node}
      <PageHead title={u.email} sub={`User ${u.id} · joined ${new Date(u.createdAt).toLocaleDateString()} · ${d.data!.sessions} active session(s)`}>
        <Link className="admBtn" href={`/admin/emails?compose=1&to=${encodeURIComponent(u.email)}`}>Email</Link>
        <button className="admBtn" onClick={() => patch({ action: "reset_password" }, "Password reset email sent")}>Send password reset</button>
        {!u.emailVerifiedAt && <button className="admBtn" onClick={() => patch({ action: "send_verification" }, "Confirm-email link sent")}>Send confirm-email link</button>}
        {!u.emailVerifiedAt && <ConfirmButton className="admBtn" message="Mark this email as confirmed? Only do this if you know they own the address: it hands them any team seats invited to it." onConfirm={() => patch({ action: "mark_verified" }, "Email marked confirmed")}>Mark email confirmed</ConfirmButton>}
        <ConfirmButton className="admBtn" message="Sign this user out everywhere?" onConfirm={() => patch({ action: "sign_out_all" }, "Signed out everywhere")}>Sign out all</ConfirmButton>
        <ConfirmButton className="admBtn admBtn--danger" message="Delete this user? Booths must be released first. This cannot be undone." onConfirm={async () => { try { await api(`/api/admin/users/${id}`, { method: "DELETE" }); toast.ok("Deleted"); router.push("/admin/users"); } catch (e) { toast.err(e); } }}>Delete</ConfirmButton>
      </PageHead>
      <div className="admGrid">
        <div className="admTile"><div className="admLabel">Credit</div><div className="admTile__n"><Money cents={u.creditCents} /></div></div>
        <div className="admTile"><div className="admLabel">Coins</div><div className="admTile__n">{u.coins}</div><div className="admTile__sub">streak {u.streak}</div></div>
        <div className="admTile"><div className="admLabel">Booths</div><div className="admTile__n">{d.data!.booths.length}</div></div>
        <div className="admTile"><div className="admLabel">Saved card</div><div className="admTile__n">{u.dcPaymentMethodId ? "Yes" : "No"}</div>{u.dcPaymentMethodId && <div className="admTile__sub admMono">{u.dcPaymentMethodId.slice(0, 18)}… {u.cardIp && `· ${u.cardIp}`}</div>}</div>
      </div>
      <div className="admSplit">
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Profile</h2>{u.isAdmin ? <Badge kind="hot">superadmin</Badge> : areas.length ? <Badge>staff</Badge> : null}</div>
          <form className="admForm" onSubmit={(e) => { e.preventDefault(); patch(f); }}>
            <Field label="Email (sign-in)"><Input type="email" value={f.email} onChange={(e) => setForm({ ...f, email: e.target.value })} /></Field>
            <Field label="Display name"><Input value={f.displayName} onChange={(e) => setForm({ ...f, displayName: e.target.value })} /></Field>
            <Field label="Handle"><Input value={f.handle} onChange={(e) => setForm({ ...f, handle: e.target.value })} /></Field>
            <Checkbox label="Receives email notifications" checked={f.notifyEmail} onChange={(e) => setForm({ ...f, notifyEmail: e.target.checked })} />
            <div className="admRow"><span className="admLabel">Referral</span><span className="admMono">{u.referralCode}</span>{u.referredBy && <span className="admMuted">referred by {u.referredBy} · {u.referralPaidAt ? "referral paid" : "referral pays on their first purchase"}</span>}</div>
            <div className="admRow"><span className="admLabel">Email</span>{u.emailVerifiedAt ? <span className="admMuted">confirmed <DateTime value={u.emailVerifiedAt} /></span> : <span className="admMuted">not confirmed</span>}</div>
            <div className="span2 admRow">
              <button className="admBtn admBtn--primary">Save</button>
              {u.dcPaymentMethodId && <ConfirmButton className="admBtn" message="Forget the saved card? Plan renewals will fail until they add a new one." onConfirm={() => patch({ action: "clear_card" }, "Card cleared")}>Forget card</ConfirmButton>}
              <button type="button" className="admBtn" onClick={() => { const p = window.prompt("New password (10+ characters). Leave empty to remove password sign-in for this user."); if (p === null) return; patch({ action: "set_password", password: p }, p ? "Password set" : "Password removed"); }}>Set password</button>
            </div>
          </form>
        </div>
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Grant credit / coins</h2></div>
          <form className="admForm" onSubmit={(e) => { e.preventDefault(); patch({ creditDeltaCents: Number(grant.creditDeltaCents || 0), coinsDelta: Number(grant.coinsDelta || 0), reason: grant.reason }, "Granted"); setGrant({ creditDeltaCents: "", coinsDelta: "", reason: "" }); }}>
            <Field label="Credit (cents, negative to deduct)"><Input type="number" value={grant.creditDeltaCents} onChange={(e) => setGrant({ ...grant, creditDeltaCents: e.target.value })} placeholder="500" /></Field>
            <Field label="Coins (negative to deduct)"><Input type="number" value={grant.coinsDelta} onChange={(e) => setGrant({ ...grant, coinsDelta: e.target.value })} placeholder="100" /></Field>
            <Field label="Reason" className="span2"><Input value={grant.reason} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} placeholder="goodwill, refund, contest prize…" /></Field>
            <div className="span2"><button className="admBtn admBtn--primary">Apply</button></div>
          </form>
          <div className="admLabel" style={{ marginTop: 12 }}>Coin ledger</div>
          {d.data!.coins.length === 0 ? <Empty>No coin activity.</Empty> : <div className="admTableWrap"><table className="admTable"><tbody>{d.data!.coins.map((c) => <tr key={c.id}><td className={c.delta >= 0 ? "" : "admMuted"}>{c.delta >= 0 ? "+" : ""}{c.delta}</td><td className="admMono">{c.reason}</td><td className="admMuted">{c.ref}</td><td><DateTime value={c.createdAt} /></td></tr>)}</tbody></table></div>}
        </div>
      </div>
      <div className="admSplit">
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Booths</h2></div>
          {d.data!.booths.length === 0 ? <Empty>No booths.</Empty> : <div className="admTableWrap"><table className="admTable"><thead><tr><th>#</th><th>Name</th><th>Plan</th><th>Value</th><th>Claimed</th></tr></thead><tbody>{d.data!.booths.map((p) => <tr key={p.id}><td className="admMono"><Link href={`/admin/booths/${p.id}`}>#{p.id}</Link></td><td>{p.name} {p.hidden && <Badge kind="dim">hidden</Badge>}</td><td><Badge>{p.tier}</Badge> {p.subscriptionStatus && <span className="admMuted">{p.subscriptionStatus}</span>}</td><td className="num"><Money cents={p.valueCents} /></td><td><DateTime value={p.claimedAt} dateOnly /></td></tr>)}</tbody></table></div>}
        </div>
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Admin permissions</h2>{u.isAdmin ? <Badge kind="hot">superadmin · everything</Badge> : areas.length ? <Badge>{areas.length} area{areas.length === 1 ? "" : "s"}</Badge> : <Badge kind="muted">none</Badge>}</div>
          <p className="admMuted" style={{ marginTop: 0 }}>A superadmin sees all of /admin. Anyone else gets exactly the areas ticked here and nothing more; the sidebar and every admin API check them. Only a superadmin can change these.</p>
          <form onSubmit={(e) => { e.preventDefault(); patch({ permissions: areas }, "Permissions saved"); setPerms(null); }} className="admForm">
            {ADMIN_AREAS.map((a) => <Checkbox key={a.id} label={`${a.label} — ${a.blurb}`} checked={u.isAdmin || areas.includes(a.id)} disabled={u.isAdmin} onChange={(e) => setPerms(e.target.checked ? [...areas, a.id] : areas.filter((x) => x !== a.id))} />)}
            <div className="span2" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="admBtn admBtn--primary" disabled={u.isAdmin || perms === null}>Save permissions</button>
              <ConfirmButton className="admBtn" message={u.isAdmin ? "Remove superadmin? They keep only the areas ticked above." : "Make this user a superadmin with access to everything?"} onConfirm={() => patch({ isAdmin: !u.isAdmin }, u.isAdmin ? "Superadmin removed" : "Superadmin granted")}>{u.isAdmin ? "Remove superadmin" : "Make superadmin"}</ConfirmButton>
            </div>
          </form>
        </div>
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Transactions</h2></div>
          {d.data!.txs.length === 0 ? <Empty>No transactions.</Empty> : <div className="admTableWrap"><table className="admTable"><thead><tr><th>Kind</th><th>Booth</th><th>Status</th><th>Amount</th><th>When</th></tr></thead><tbody>{d.data!.txs.map((t) => <tr key={t.id}><td><Link href={`/admin/transactions/${t.id}`}>{t.kind}</Link>{t.buyerId !== u.id && <span className="admMuted"> (seller)</span>}</td><td className="admMono">#{t.boothId}</td><td><Badge>{t.status}</Badge></td><td className="num"><Money cents={t.amountCents} /></td><td><DateTime value={t.createdAt} /></td></tr>)}</tbody></table></div>}
        </div>
      </div>
      <div className="admCard">
        <div className="admCard__hd"><h2 className="admH2">Email</h2><Link className="admBtn admBtn--sm" href={`/admin/emails?folder=all&q=${encodeURIComponent(u.email)}`}>Search inbox</Link></div>
        {d.data!.mail.length === 0 ? <Empty>No mail yet.</Empty> : <div className="admTableWrap"><table className="admTable"><tbody>{d.data!.mail.map((m) => <tr key={m.id}><td><Badge kind="dim">{m.direction}</Badge></td><td><Link href={`/admin/emails?folder=all&id=${m.id}`}>{m.subject}</Link></td><td><Badge>{m.status || "received"}</Badge></td><td><DateTime value={m.createdAt} /></td></tr>)}</tbody></table></div>}
      </div>
    </>
  );
}
