import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export function AddAccountDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onCreated: (account: { id: string; client_name: string }) => void;
}) {
  const [draft, setDraft] = useState({ client_name: "", contact_person: "", email: "", cc_emails: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!draft.client_name.trim()) return;
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) { toast.error("Enter a valid email address"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("create_manual_risk_account", {
        _client_name: draft.client_name.trim(), _contact_person: draft.contact_person,
        _email: draft.email, _cc_emails: draft.cc_emails, _phone: draft.phone, _address: draft.address,
      });
      if (error) throw error;
      if (!data) throw new Error("Account could not be created");
      onCreated({ id: data, client_name: draft.client_name.trim() });
      setDraft({ client_name: "", contact_person: "", email: "", cc_emails: "", phone: "", address: "" });
      onOpenChange(false);
      toast.success("Account created");
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={(value) => !saving && onOpenChange(value)}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Add account</DialogTitle></DialogHeader>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-3">
        {([
          ["client_name", "Account name *"], ["contact_person", "Contact person"],
          ["email", "Email"], ["cc_emails", "CC emails"], ["phone", "Phone"],
        ] as const).map(([key, label]) => <div key={key} className="space-y-1.5">
          <Label htmlFor={`account-${key}`}>{label}</Label>
          <Input id={`account-${key}`} type={key === "email" ? "email" : "text"} required={key === "client_name"}
            className="min-h-11 text-base" value={draft[key]} maxLength={key === "client_name" ? 200 : 1000}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
        </div>)}
        <div className="space-y-1.5"><Label htmlFor="account-address">Address</Label><Textarea id="account-address" className="text-base" value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} /></div>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving || !draft.client_name.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save account</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}