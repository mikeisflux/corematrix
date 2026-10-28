"use client";
import Link from "next/link";
import { useState } from "react";
import { useJson, Pager, PageHead, Badge, Money, DateTime, SearchBox, qs, Empty, api, useToast, Field, Input, Checkbox } from "./shared";
import { ADMIN_AREAS, parsePermissions, type AdminArea } from "@/lib/permissions";
interface Row { permissions: string | null; id: string; email: string; displayName: string | null; handle: string | null; creditCents: number; coins: number; isAdmin: boolean; createdAt: number; lastSeenAt: number | null; booths: number; spentCents: number }
export default function UsersList() {
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const list = useJson<{ rows: Row[]; total: number; pages: number }>(`/api/admin/users?${qs({ q, page })}`);
  const [creating, setCreating] = useState(false);
  return (
    <>
      {creating && <NewUser onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} />}
      <PageHead title="Users" sub="Every account (email + password). Credit is spendable at checkout; coins are the arcade currency.">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Email, name, handle…" />
        <button className="admBtn admBtn--primary" onClick={() => setCreating(true)}>New user</button>
        <a className="admBtn" href={`/api/admin/users?${qs({ q, export: "csv" })}`}>Export CSV</a>
      </PageHead>
      {list.error && <div className="admNote admNote--err">{list.error}</div>}
      <div className="admCard">
        <div className="admTableWrap"><table className="admTable">
          <thead><tr><th>User</th><th>Booths</th><th>Spent</th><th>Credit</th><th>Coins</th><th>Joined</th><th>Last seen</th><th></th></tr></thead>
          <tbody>{list.data?.rows.map((u) => (
            <tr key={u.id}><td><Link href={`/admin/users/${u.id}`}>{u.email}</Link>{u.isAdmin ? <> <Badge kind="hot">superadmin</Badge></> : parsePermissions(u.permissions).length ? <> <Badge>staff · {parsePermissions(u.permissions).length}</Badge></> : null}<div className="admMuted">{[u.displayName, u.handle && `@${u.handle}`].filter(Boolean).join(" · ")}</div></td>
              <td className="num">{u.booths}</td><td className="num"><Money cents={u.spentCents} /></td><td className="num"><Money cents={u.creditCents} /></td><td className="num">{u.coins}</td><td><DateTime value={u.createdAt} dateOnly /></td><td><DateTime value={u.lastSeenAt} /></td><td><Link className="admBtn admBtn--sm" href={`/admin/users/${u.id}`}>Open</Link></td></tr>
          ))}</tbody>
        </table></div>
        {list.data && list.data.rows.length === 0 && <Empty>{list.loading ? "Loading…" : "No users match."}</Empty>}
        {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </div>
    </>
  );
}

/** Create an account by hand: with a password, or with a reset link so the person picks their own. */
function NewUser({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ email: "", displayName: "", handle: "", password: "", creditCents: "", coins: "", isAdmin: false, permissions: [] as AdminArea[] });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api("/api/admin/users", { method: "POST", json: { ...f, creditCents: Number(f.creditCents) || 0, coins: Number(f.coins) || 0, password: f.password || undefined } });
      toast.ok(f.password ? "User created" : "User created · reset link emailed so they can pick a password"); onCreated();
    } catch (err) { toast.err(err); }
    setBusy(false);
  };
  return (
    <div className="admCard" style={{ marginBottom: 16 }}>
      <div className="admCard__hd"><h2 className="admH2">New user</h2><button className="admBtn admBtn--sm" onClick={onClose}>Close</button></div>
      <form onSubmit={submit} className="admForm">
        <Field label="Email (sign-in)"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Display name"><Input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
        <Field label="Handle"><Input value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder="optional" /></Field>
        <Field label="Password" hint="Leave empty to email them a link to choose one."><Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="10+ characters, or empty" autoComplete="off" /></Field>
        <Field label="Starting credit (cents)"><Input type="number" value={f.creditCents} onChange={(e) => setF({ ...f, creditCents: e.target.value })} placeholder="0" /></Field>
        <Field label="Starting coins"><Input type="number" value={f.coins} onChange={(e) => setF({ ...f, coins: e.target.value })} placeholder="0" /></Field>
        <div className="span2"><div className="admLabel" style={{ marginBottom: 6 }}>Admin permissions (superadmins only can set these)</div>
          <Checkbox label="Superadmin — everything" checked={f.isAdmin} onChange={(e) => setF({ ...f, isAdmin: e.target.checked })} />
          {!f.isAdmin && ADMIN_AREAS.map((a) => <Checkbox key={a.id} label={`${a.label} — ${a.blurb}`} checked={f.permissions.includes(a.id)} onChange={(e) => setF({ ...f, permissions: e.target.checked ? [...f.permissions, a.id] : f.permissions.filter((x) => x !== a.id) })} />)}
        </div>
        <div className="span2"><button className="admBtn admBtn--primary" disabled={busy}>Create user</button></div>
      </form>
    </div>
  );
}
