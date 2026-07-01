import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface VenueRow {
  id: string;
  venue_name: string;
  address: string;
  city: string | null;
  province: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  is_active: boolean;
}

const emptyForm = {
  venue_name: "",
  address: "",
  city: "",
  province: "",
  gps_latitude: "",
  gps_longitude: "",
  is_active: true,
};

const VenueManagement = () => {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<VenueRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ["venue-management"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polygraph_venues" as any)
        .select("*")
        .order("venue_name");
      if (error) throw error;
      return (data || []) as unknown as VenueRow[];
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (v: VenueRow) => {
    setEditing(v);
    setForm({
      venue_name: v.venue_name || "",
      address: v.address || "",
      city: v.city || "",
      province: v.province || "",
      gps_latitude: v.gps_latitude != null ? String(v.gps_latitude) : "",
      gps_longitude: v.gps_longitude != null ? String(v.gps_longitude) : "",
      is_active: v.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.venue_name.trim() || !form.address.trim()) {
      toast({
        title: "Missing details",
        description: "Venue name and address are required.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      venue_name: form.venue_name.trim(),
      address: form.address.trim(),
      city: form.city.trim() || null,
      province: form.province.trim() || null,
      gps_latitude: form.gps_latitude ? Number(form.gps_latitude) : null,
      gps_longitude: form.gps_longitude ? Number(form.gps_longitude) : null,
      is_active: form.is_active,
    };

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("polygraph_venues" as any)
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Venue updated" });
      } else {
        const { error } = await supabase
          .from("polygraph_venues" as any)
          .insert(payload);
        if (error) throw error;
        toast({ title: "Venue added" });
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["venue-management"] });
      qc.invalidateQueries({ queryKey: ["polygraph-venues"] });
      qc.invalidateQueries({ queryKey: ["schedule-venues"] });
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.message || "Unable to save venue.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase
        .from("polygraph_venues" as any)
        .delete()
        .eq("id", deleteId);
      if (error) throw error;
      toast({ title: "Venue removed" });
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["venue-management"] });
      qc.invalidateQueries({ queryKey: ["polygraph-venues"] });
      qc.invalidateQueries({ queryKey: ["schedule-venues"] });
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description:
          err?.message ||
          "This venue may be linked to existing appointments. Deactivate it instead.",
        variant: "destructive",
      });
    }
  };

  const toggleActive = async (v: VenueRow) => {
    const { error } = await supabase
      .from("polygraph_venues" as any)
      .update({ is_active: !v.is_active })
      .eq("id", v.id);
    if (error) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    qc.invalidateQueries({ queryKey: ["venue-management"] });
    qc.invalidateQueries({ queryKey: ["polygraph-venues"] });
    qc.invalidateQueries({ queryKey: ["schedule-venues"] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Pre-Approved Venues
            </CardTitle>
            <CardDescription>
              Manage the vetted TLDV venues available when scheduling polygraph
              appointments.
            </CardDescription>
          </div>
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4" />
            Add Venue
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : venues.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No pre-approved venues yet</p>
              <p className="text-sm">
                Add a venue so admins can select it when scheduling.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venue</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>City / Province</TableHead>
                    <TableHead>GPS</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {venues.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.venue_name}</TableCell>
                      <TableCell className="max-w-[280px] text-sm">
                        {v.address}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[v.city, v.province].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {v.gps_latitude != null && v.gps_longitude != null
                          ? `${Number(v.gps_latitude).toFixed(5)}, ${Number(v.gps_longitude).toFixed(5)}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={v.is_active}
                            onCheckedChange={() => toggleActive(v)}
                          />
                          {v.is_active ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Hidden</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(v)}
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(v.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit venue" : "Add pre-approved venue"}
            </DialogTitle>
            <DialogDescription>
              Vetted venues appear in the venue selector when scheduling
              polygraph appointments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="venue_name">Venue name *</Label>
              <Input
                id="venue_name"
                value={form.venue_name}
                onChange={(e) =>
                  setForm({ ...form, venue_name: e.target.value })
                }
                placeholder="TLDV Head Office"
              />
            </div>
            <div>
              <Label htmlFor="address">Address *</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="123 Main Street, Suburb"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="province">Province</Label>
                <Input
                  id="province"
                  value={form.province}
                  onChange={(e) =>
                    setForm({ ...form, province: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lat">GPS latitude</Label>
                <Input
                  id="lat"
                  type="number"
                  step="any"
                  value={form.gps_latitude}
                  onChange={(e) =>
                    setForm({ ...form, gps_latitude: e.target.value })
                  }
                  placeholder="-26.20227"
                />
              </div>
              <div>
                <Label htmlFor="lng">GPS longitude</Label>
                <Input
                  id="lng"
                  type="number"
                  step="any"
                  value={form.gps_longitude}
                  onChange={(e) =>
                    setForm({ ...form, gps_longitude: e.target.value })
                  }
                  placeholder="28.04363"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Active — visible to admins when scheduling
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add venue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this venue?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. If the venue is linked to existing
              appointments the delete will fail — deactivate it instead to hide
              it from new bookings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VenueManagement;