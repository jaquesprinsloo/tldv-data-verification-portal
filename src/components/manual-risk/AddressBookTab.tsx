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
import { EMAIL_RE, type MrContact } from "./AddressBook";

const sb = supabase as any;

type ContactRow = MrContact & { created_at?: string };
type ClientLite = { id: string; client_name: string };

/** Global address book across every manual-risk client. */
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

  const { data: contacts = [], isLoading, refetch } = useQuery<ContactRow[]>({
    queryKey: ["mra-all-contacts"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_contacts")
        .select("id, client_id, name, email, is_default")
        .order("email", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
  });

  const invalidate = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["mra-contacts"] });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (clientFilter !== "all" && c.client_id !== clientFilter) return false;
      if (!q) return true;
      return (
        c.email.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        clientName(c.client_id).toLowerCase().includes(q)
      );
    });
  }, [contacts, search, clientFilter, clients]);

  const save = async (id: string) => {
    const draft = editing[id];
    if (!draft) return;
    const email = draft.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { toast.error("Enter a valid email address"); return; }
    const { error } = await sb.from("manual_risk_contacts")
      .update({ name: draft.name.trim() || null, email }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditing((p) => { const n = { ...p }; delete n[id]; return n; });
    toast.success("Contact updated");
    invalidate();
  };

  const toggleDefault = async (c: ContactRow) => {
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

  const add = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!newClient) { toast.error("Choose the client this contact belongs to"); return; }
    if (!EMAIL_RE.test(email)) { toast.error("Enter a valid email address"); return; }
    const { error } = await sb.from("manual_risk_contacts").insert({
      client_id: newClient, name: newName.trim() || null, email, is_default: true,
    });
    if (error) { toast.error(error.message); return; }
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
          <Badge variant="secondary">{contacts.length} email address(es)</Badge>
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
        Every email address used so far. Add a name or correct an address here — contacts marked
        "Default" are pre-ticked when a submission confirmation is sent for that client.
      </p>

      <div className="border rounded-md divide-y max-h-[55vh] overflow-y-auto">
        {isLoading && <p className="text-sm text-muted-foreground p-4">Loading address book...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground p-4">No contacts match your search.</p>
        )}
        {filtered.map((c) => {
          const draft = editing[c.id];
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-2 p-2">
              {draft ? (
                <>
                  <Input className="h-8 flex-1 min-w-[140px]" placeholder="Name" value={draft.name}
                    onChange={(e) => setEditing((p) => ({ ...p, [c.id]: { ...draft, name: e.target.value } }))} />
                  <Input className="h-8 flex-1 min-w-[180px]" placeholder="Email" value={draft.email}
                    onChange={(e) => setEditing((p) => ({ ...p, [c.id]: { ...draft, email: e.target.value } }))} />
                  <Button size="icon" variant="ghost" onClick={() => save(c.id)}>
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost"
                    onClick={() => setEditing((p) => { const n = { ...p }; delete n[c.id]; return n; })}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">
                      {c.name?.trim() || <span className="text-muted-foreground italic">No name — add one</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                  </div>
                  <Badge variant="outline" className="text-xs">{clientName(c.client_id)}</Badge>
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
