import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ListChecks } from "lucide-react";
import { toast } from "sonner";

export const LIST_TYPES = [
  { key: "attention_contact", title: "Attention (people booking)", hasEmail: true },
  { key: "company", title: "Companies / Clients", hasEmail: true },
  { key: "examiner", title: "Examiners", hasEmail: true },
  { key: "polygraph_type", title: "Polygraph Examination Types", hasEmail: false },
  { key: "vetting_type", title: "Vetting Types", hasEmail: false },
] as const;

export interface ListOption {
  id: string;
  list_type: string;
  label: string;
  email: string | null;
  is_active: boolean;
}

export const useBookingLists = () =>
  useQuery({
    queryKey: ["booking-list-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_list_options" as any)
        .select("*")
        .eq("is_active", true)
        .order("label");
      if (error) throw error;
      return (data || []) as unknown as ListOption[];
    },
  });

const ListSection = ({
  type,
  title,
  hasEmail,
  options,
}: {
  type: string;
  title: string;
  hasEmail: boolean;
  options: ListOption[];
}) => {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      if (!label.trim()) throw new Error("Please enter a name");
      const { error } = await supabase
        .from("booking_list_options" as any)
        .insert({ list_type: type, label: label.trim(), email: email.trim() || null } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setLabel("");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["booking-list-options"] });
      toast.success("Added to list");
    },
    onError: (e: any) =>
      toast.error(e.message?.includes("duplicate") ? "That name is already on the list" : e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("booking_list_options" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-list-options"] });
      toast.success("Removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">
          {options.length} saved {options.length === 1 ? "entry" : "entries"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`grid gap-2 ${hasEmail ? "sm:grid-cols-[1fr_1fr_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add a name" />
          </div>
          {hasEmail && (
            <div className="space-y-1">
              <Label className="text-xs">Email (optional)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.co.za" />
            </div>
          )}
          <div className="flex items-end">
            <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {options.length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
          {options.map((o) => (
            <Badge key={o.id} variant="secondary" className="flex items-center gap-1 py-1 pl-2 pr-1 text-xs">
              <span>{o.label}</span>
              {o.email && <span className="text-muted-foreground">· {o.email}</span>}
              <button
                type="button"
                onClick={() => remove.mutate(o.id)}
                className="ml-1 rounded p-1 hover:bg-destructive/10"
                aria-label={`Remove ${o.label}`}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const BookingListsManager = () => {
  const { data: options = [], isLoading } = useBookingLists();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold">Booking Lists</h2>
          <p className="text-sm text-muted-foreground">
            Names you save here become the choices on every booking confirmation.
          </p>
        </div>
      </div>
      {LIST_TYPES.map((t) => (
        <ListSection
          key={t.key}
          type={t.key}
          title={t.title}
          hasEmail={t.hasEmail}
          options={options.filter((o) => o.list_type === t.key)}
        />
      ))}
    </div>
  );
};

export default BookingListsManager;
