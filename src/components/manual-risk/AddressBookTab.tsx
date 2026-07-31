import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, Check, X, Search, BookUser } from "lucide-react";
import { EMAIL_RE, groupContacts, useAllContacts, type MrContact } from "./AddressBook";

const sb = supabase as any;

type ContactRow = MrContact & { created_at?: string };
type ClientLite = { id: string; client_name: string };

/** Global address book — one row per unique email address. */
export function AddressBookTab({ clients }: { clients: ClientLite[] }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Record<string, { name: string; email: string }>>({});
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newClient, setNewClient] = useState<string>("");

  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.client_name ?? "Unknown client";

  const { data: contacts = [], isLoading, refetch } = useAllContacts();
  const groups = useMemo(() => groupContacts(contacts), [contacts]);

  const invalidate = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["mra-contacts"] });
    qc.invalidateQueries({ queryKey: ["mra-all-contacts"] });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (clientFilter !== "all" && !g.clientIds.includes(clientFilter)) return false;
      if (!q) return true;
      return (
        g.email.includes(q) ||
        (g.name ?? "").toLowerCase().includes(q) ||
        g.clientIds.some((id) => clientName(id).toLowerCase().includes(q))
      );
    });
  }, [groups, search, clientFilter, clients]);

  /** Edits apply to every linked client row so the address stays unique. */
  const save = async (key: string, ids: string[]) => {
    const draft = editing[key];
    if (!draft) return;
    const email = draft.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { toast.error("Enter a valid email address"); return; }
    if (email !== key && groups.some((g) => g.email === email)) {
      toast.error("That email address already exists in the address book"); return;
    }
    const { error } = await sb.from("manual_risk_contacts")
      .update({ name: draft.name.trim() || null, email }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    setEditing((p) => { const n = { ...p }; delete n[key]; return n; });
    toast.success("Contact updated");
    invalidate();
  };

  const toggleDefault = async (ids: string[], next: boolean) => {
    const { error } = await sb.from("manual_risk_contacts")
      .update({ is_default: next }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    invalidate();
  };

  const remove = async (email: string, ids: string[]) => {
    if (!confirm(`Remove ${email} from the address book (${ids.length} client link(s))?`)) return;
    const { error } = await sb.from("manual_risk_contacts").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    invalidate();
  };

  const add = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!newClient) { toast.error("Choose the client this contact belongs to"); return; }
    if (!EMAIL_RE.test(email)) { toast.error("Enter a valid email address"); return; }
    if (contacts.some((c) => c.email.trim().toLowerCase() === email && c.client_id === newClient)) {
      toast.error("That address is already saved for this client"); return;
    }
    const { error } = await sb.from("manual_risk_contacts").insert({
      client_id: newClient, name: newName.trim() || null, email, is_default: true,
    });
    if (error) {
      toast.error(/duplicate|unique/i.test(error.message)
        ? "That address is already saved for this client" : error.message);
      return;
    }
    setNewName(""); setNewEmail("");
    toast.success("Contact added");
    invalidate();
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <BookUser className="h-5 w-5 text-red-600" />
          <h2 className="font-semibold">Address Book</h2>
          <Badge variant="secondary">{groups.length} unique email address(es)</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 w-64" placeholder="Search name, email or client"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Every email address used so far, listed once. Add a name or correct an address here and it
        updates for every client it is linked to. Addresses marked "Default" are pre-ticked when a
        submission confirmation is sent for those clients.
      </p>

      <div className="border rounded-md divide-y max-h-[55vh] overflow-y-auto">
        {isLoading && <p className="text-sm text-muted-foreground p-4">Loading address book...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground p-4">No contacts match your search.</p>
        )}
        {filtered.map((g) => {
          const draft = editing[g.email];
          const ids = g.rows.map((r) => r.id);
          return (
            <div key={g.email} className="flex flex-wrap items-center gap-2 p-2">
              {draft ? (
                <>
                  <Input className="h-8 flex-1 min-w-[140px]" placeholder="Name" value={draft.name}
                    onChange={(e) => setEditing((p) => ({ ...p, [g.email]: { ...draft, name: e.target.value } }))} />
                  <Input className="h-8 flex-1 min-w-[180px]" placeholder="Email" value={draft.email}
                    onChange={(e) => setEditing((p) => ({ ...p, [g.email]: { ...draft, email: e.target.value } }))} />
                  <Button size="icon" variant="ghost" onClick={() => save(g.email, ids)}>
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost"
                    onClick={() => setEditing((p) => { const n = { ...p }; delete n[g.email]; return n; })}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">
                      {g.name || <span className="text-muted-foreground italic">No name — add one</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{g.email}</div>
                  </div>
                  {g.clientIds.length === 1 ? (
                    <Badge variant="outline" className="text-xs">{clientName(g.clientIds[0])}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs"
                      title={g.clientIds.map(clientName).join(", ")}>
                      {g.clientIds.length} client accounts
                    </Badge>
                  )}
                  <Button type="button" variant={g.isDefaultAnywhere ? "default" : "outline"} size="sm"
                    className={g.isDefaultAnywhere ? "bg-red-600 hover:bg-red-700 h-7 text-xs" : "h-7 text-xs"}
                    onClick={() => toggleDefault(ids, !g.isDefaultAnywhere)}>
                    {g.isDefaultAnywhere ? "Default" : "Not default"}
                  </Button>
                  <Button size="icon" variant="ghost"
                    onClick={() => setEditing((p) => ({ ...p, [g.email]: { name: g.name ?? "", email: g.email } }))}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(g.email, ids)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 border-t pt-3">
        <Select value={newClient} onValueChange={setNewClient}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Input placeholder="email@company.co.za" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <Button onClick={add} className="bg-red-600 hover:bg-red-700">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
    </Card>
  );
}
