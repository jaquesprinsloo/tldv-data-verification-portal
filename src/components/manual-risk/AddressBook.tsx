import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Check, X, BookUser } from "lucide-react";

const sb = supabase as any;

export type MrContact = {
  id: string;
  client_id: string;
  name: string | null;
  email: string;
  is_default: boolean;
};

/** Recipient snapshot stored on a submission. */
export type MrRecipient = { name: string | null; email: string; primary?: boolean };

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useClientContacts(clientId: string | null | undefined) {
  return useQuery<MrContact[]>({
    queryKey: ["mra-contacts", clientId ?? "none"],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_contacts")
        .select("id, client_id, name, email, is_default")
        .eq("client_id", clientId)
        .order("is_default", { ascending: false })
        .order("email", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MrContact[];
    },
  });
}

/**
 * Checkbox picker over a client's address book. The recipient flagged as
 * primary becomes the "To" address; the rest are CC'd.
 */
export function RecipientPicker({
  clientId, value, onChange, fallbackEmail, fallbackName,
}: {
  clientId: string | null;
  value: MrRecipient[];
  onChange: (next: MrRecipient[]) => void;
  fallbackEmail?: string | null;
  fallbackName?: string | null;
}) {
  const { data: contacts = [], isLoading, refetch } = useClientContacts(clientId);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [initialised, setInitialised] = useState(false);

  useEffect(() => { setInitialised(false); }, [clientId]);

  // Seed the selection from the address book defaults the first time the
  // contacts land (or from the client's own email when the book is empty).
  useEffect(() => {
    if (initialised || isLoading || !clientId) return;
    const seed: MrRecipient[] = contacts
      .filter((c) => c.is_default)
      .map((c) => ({ name: c.name, email: c.email }));
    if (!seed.length && fallbackEmail?.trim()) {
      seed.push({ name: fallbackName?.trim() || null, email: fallbackEmail.trim() });
    }
    if (seed.length) {
      const idx = fallbackEmail
        ? seed.findIndex((s) => s.email.toLowerCase() === fallbackEmail.trim().toLowerCase())
        : -1;
      const primaryIdx = idx >= 0 ? idx : 0;
      onChange(seed.map((s, i) => ({ ...s, primary: i === primaryIdx })));
    }
    setInitialised(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, isLoading, clientId, initialised]);

  const selectedKeys = useMemo(
    () => new Set(value.map((v) => v.email.toLowerCase())),
    [value],
  );

  const toggle = (c: { name: string | null; email: string }, checked: boolean) => {
    if (checked) {
      const next: MrRecipient[] = [...value, { name: c.name, email: c.email }];
      if (!next.some((r) => r.primary)) next[0].primary = true;
      onChange(next);
    } else {
      const next = value
        .filter((r) => r.email.toLowerCase() !== c.email.toLowerCase())
        .map((r) => ({ ...r }));
      if (next.length && !next.some((r) => r.primary)) next[0].primary = true;
      onChange(next);
    }
  };

  const setPrimary = (email: string) => {
    onChange(value.map((r) => ({ ...r, primary: r.email.toLowerCase() === email.toLowerCase() })));
  };

  const addContact = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { toast.error("Enter a valid email address"); return; }
    if (clientId) {
      const { error } = await sb.from("manual_risk_contacts").insert({
        client_id: clientId, name: newName.trim() || null, email, is_default: false,
      });
      if (error && !/duplicate/i.test(error.message)) { toast.error(error.message); return; }
      await refetch();
    }
    if (!selectedKeys.has(email)) {
      onChange([...value, { name: newName.trim() || null, email, primary: value.length === 0 }]);
    }
    setNewName(""); setNewEmail(""); setAdding(false);
  };

  // Ad-hoc recipients that aren't (yet) in the address book
  const extras = value.filter(
    (r) => !contacts.some((c) => c.email.toLowerCase() === r.email.toLowerCase()),
  );

  const renderRow = (
    key: string,
    contact: { name: string | null; email: string },
    checked: boolean,
  ) => {
    const rec = value.find((r) => r.email.toLowerCase() === contact.email.toLowerCase());
    return (
      <li key={key} className="flex items-center gap-2 py-1">
        <Checkbox checked={checked} onCheckedChange={(v) => toggle(contact, !!v)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm truncate">
            {contact.name?.trim() || <span className="text-muted-foreground">No name</span>}
          </div>
          <div className="text-xs text-muted-foreground truncate">{contact.email}</div>
        </div>
        {checked && (
          rec?.primary ? (
            <Badge className="bg-red-600 text-white">To</Badge>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs"
              onClick={() => setPrimary(contact.email)}>
              CC · make To
            </Button>
          )
        )}
      </li>
    );
  };

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2"><BookUser className="h-4 w-4" /> Recipients</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tick who should receive the confirmation. The same people receive the final report.
      </p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading address book...</p>
      ) : (
        <ul className="max-h-52 overflow-y-auto divide-y">
          {contacts.map((c) => renderRow(c.id, c, selectedKeys.has(c.email.toLowerCase())))}
          {extras.map((r) => renderRow(`x-${r.email}`, { name: r.name ?? null, email: r.email }, true))}
          {!contacts.length && !extras.length && (
            <li className="text-xs text-muted-foreground py-2">
              No contacts saved for this client yet — add one below.
            </li>
          )}
        </ul>
      )}

      {adding && (
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="email@company.co.za" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Button type="button" onClick={addContact} className="bg-red-600 hover:bg-red-700">Save</Button>
        </div>
      )}
    </div>
  );
}

/** Full address-book manager for one client. */
export function ClientAddressBookDialog({
  clientId, clientName, open, onClose,
}: {
  clientId: string | null;
  clientName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: contacts = [], refetch } = useClientContacts(open ? clientId : null);
  const [editing, setEditing] = useState<Record<string, { name: string; email: string }>>({});
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const invalidate = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["mra-contacts", clientId ?? "none"] });
  };

  const add = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { toast.error("Enter a valid email address"); return; }
    const { error } = await sb.from("manual_risk_contacts").insert({
      client_id: clientId, name: newName.trim() || null, email, is_default: true,
    });
    if (error) { toast.error(error.message); return; }
    setNewName(""); setNewEmail("");
    invalidate();
  };

  const save = async (id: string) => {
    const draft = editing[id];
    if (!draft) return;
    const email = draft.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { toast.error("Enter a valid email address"); return; }
    const { error } = await sb.from("manual_risk_contacts")
      .update({ name: draft.name.trim() || null, email }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditing((p) => { const n = { ...p }; delete n[id]; return n; });
    invalidate();
  };

  const toggleDefault = async (c: MrContact) => {
    const { error } = await sb.from("manual_risk_contacts")
      .update({ is_default: !c.is_default }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    invalidate();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this contact from the address book?")) return;
    const { error } = await sb.from("manual_risk_contacts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Address Book{clientName ? ` — ${clientName}` : ""}</DialogTitle>
          <DialogDescription>
            Names and email addresses used for submission confirmations and report delivery.
            Default contacts are pre-ticked on new submissions.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto divide-y">
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No contacts saved yet.</p>
          )}
          {contacts.map((c) => {
            const draft = editing[c.id];
            return (
              <div key={c.id} className="flex items-center gap-2 py-2">
                {draft ? (
                  <>
                    <Input className="h-8" placeholder="Name" value={draft.name}
                      onChange={(e) => setEditing((p) => ({ ...p, [c.id]: { ...draft, name: e.target.value } }))} />
                    <Input className="h-8" placeholder="Email" value={draft.email}
                      onChange={(e) => setEditing((p) => ({ ...p, [c.id]: { ...draft, email: e.target.value } }))} />
                    <Button size="icon" variant="ghost" onClick={() => save(c.id)}><Check className="h-4 w-4 text-green-600" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing((p) => { const n = { ...p }; delete n[c.id]; return n; })}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{c.name?.trim() || <span className="text-muted-foreground">No name</span>}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                    </div>
                    <Button type="button" variant={c.is_default ? "default" : "outline"} size="sm"
                      className={c.is_default ? "bg-red-600 hover:bg-red-700 h-7 text-xs" : "h-7 text-xs"}
                      onClick={() => toggleDefault(c)}>
                      {c.is_default ? "Default" : "Not default"}
                    </Button>
                    <Button size="icon" variant="ghost"
                      onClick={() => setEditing((p) => ({ ...p, [c.id]: { name: c.name ?? "", email: c.email } }))}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 border-t pt-3">
          <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="email@company.co.za" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Button onClick={add} className="bg-red-600 hover:bg-red-700"><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
