import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Send, CheckCircle, Search, FileText, Pencil } from "lucide-react";

interface Client {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  company_name: string | null;
  template_id: string | null;
  created_at: string;
}

const CandexClients = () => {
  const queryClient = useQueryClient();
  const [showNewClient, setShowNewClient] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", company: "" });
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", company: "" });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["candex-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candex_clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: invitationCounts = {} } = useQuery({
    queryKey: ["candex-invitation-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candex_invitations").select("client_id, status");
      if (error) throw error;
      const counts: Record<string, { sent: number; total: number }> = {};
      (data || []).forEach((inv) => {
        if (!counts[inv.client_id]) counts[inv.client_id] = { sent: 0, total: 0 };
        counts[inv.client_id].total++;
        if (inv.status === "sent" || inv.status === "completed") counts[inv.client_id].sent++;
      });
      return counts;
    },
  });

  const { data: applicationCounts = {} } = useQuery({
    queryKey: ["candex-application-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candex_applications").select("client_id, status");
      if (error) throw error;
      const counts: Record<string, { completed: number; total: number }> = {};
      (data || []).forEach((app) => {
        if (!counts[app.client_id]) counts[app.client_id] = { completed: 0, total: 0 };
        counts[app.client_id].total++;
        if (app.status === "completed") counts[app.client_id].completed++;
      });
      return counts;
    },
  });

  // Get available templates
  const { data: templates = [] } = useQuery({
    queryKey: ["candex-templates-for-assignment"],
    queryFn: async () => {
      const { data } = await supabase
        .from("candex_questionnaire_templates")
        .select("id, name, is_active")
        .order("name");
      return data || [];
    },
  });

  // Assign template to client
  const assignTemplate = useMutation({
    mutationFn: async ({ clientId, templateId }: { clientId: string; templateId: string | null }) => {
      const { error } = await supabase
        .from("candex_clients")
        .update({ template_id: templateId } as any)
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-clients"] });
      toast.success("Template assigned");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateClient = useMutation({
    mutationFn: async () => {
      if (!editingClient) return;
      const { error } = await supabase
        .from("candex_clients")
        .update({
          name: editForm.name,
          contact_email: editForm.email || null,
          contact_phone: editForm.phone || null,
          company_name: editForm.company || null,
        })
        .eq("id", editingClient.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-clients"] });
      setEditingClient(null);
      toast.success("Client updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const createClient = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from("candex_clients").insert({
        name: newClient.name,
        contact_email: newClient.email || null,
        contact_phone: newClient.phone || null,
        company_name: newClient.company || null,
        created_by: session?.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-clients"] });
      setShowNewClient(false);
      setNewClient({ name: "", email: "", phone: "", company: "" });
      toast.success("Client added");
    },
    onError: (e) => toast.error(e.message),
  });

  const openEditDialog = (client: Client) => {
    setEditForm({
      name: client.name,
      email: client.contact_email || "",
      phone: client.contact_phone || "",
      company: client.company_name || "",
    });
    setEditingClient(client);
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.company_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.contact_email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Clients</h2>
          <p className="text-sm text-muted-foreground">Manage clients and track their screening activity</p>
        </div>
        <Button onClick={() => setShowNewClient(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Client
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <Card className="animate-pulse"><CardContent className="py-12"><div className="h-4 bg-muted rounded w-1/3 mx-auto" /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">{searchTerm ? "No Matching Clients" : "No Clients Yet"}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm ? "Try a different search term." : "Add your first client to start managing screenings."}
            </p>
            {!searchTerm && (
              <Button onClick={() => setShowNewClient(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add Client
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Template</TableHead>
                <TableHead className="text-center">Invitations</TableHead>
                <TableHead className="text-center">Completed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => {
                const inv = invitationCounts[client.id] || { sent: 0, total: 0 };
                const app = applicationCounts[client.id] || { completed: 0, total: 0 };

                return (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="text-muted-foreground">{client.company_name || "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {client.contact_email && <div>{client.contact_email}</div>}
                        {client.contact_phone && <div className="text-muted-foreground">{client.contact_phone}</div>}
                        {!client.contact_email && !client.contact_phone && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={client.template_id || "none"}
                        onValueChange={(val) =>
                          assignTemplate.mutate({
                            clientId: client.id,
                            templateId: val === "none" ? null : val,
                          })
                        }
                      >
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                          <SelectValue placeholder="No template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No template</SelectItem>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-3 w-3" />
                                {t.name}
                                {t.is_active && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">Active</Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Send className="h-3 w-3 text-muted-foreground" />
                        <span>{inv.sent}/{inv.total}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span>{app.completed}/{app.total}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(client)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Client Name *</Label>
              <Input value={newClient.name} onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <Label>Company Name</Label>
              <Input value={newClient.company} onChange={(e) => setNewClient((p) => ({ ...p, company: e.target.value }))} placeholder="Company name" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newClient.email} onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={newClient.phone} onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))} placeholder="+27..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClient(false)}>Cancel</Button>
            <Button onClick={() => createClient.mutate()} disabled={!newClient.name.trim()}>Add Client</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CandexClients;
