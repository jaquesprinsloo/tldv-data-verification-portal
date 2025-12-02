import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
}

interface ManageAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: {
    id: string;
    name: string;
  };
  onAccessUpdated: () => void;
}

export const ManageAccessDialog = ({ 
  open, 
  onOpenChange, 
  account,
  onAccessUpdated 
}: ManageAccessDialogProps) => {
  const [adminProfiles, setAdminProfiles] = useState<AdminProfile[]>([]);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, account.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get all admin profiles
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (roleError) throw roleError;

      if (roleData && roleData.length > 0) {
        const userIds = roleData.map(r => r.user_id);
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds);

        if (profileError) throw profileError;
        setAdminProfiles(profiles || []);
      }

      // Get current access for this account
      const { data: accessData, error: accessError } = await supabase
        .from("account_access")
        .select("user_id")
        .eq("account_id", account.id);

      if (accessError) throw accessError;
      setSelectedAdmins(accessData?.map(a => a.user_id) || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load admin profiles");
    } finally {
      setLoading(false);
    }
  };

  const toggleAdminSelection = (userId: string) => {
    setSelectedAdmins(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Get current access
      const { data: currentAccess } = await supabase
        .from("account_access")
        .select("user_id")
        .eq("account_id", account.id);

      const currentUserIds = currentAccess?.map(a => a.user_id) || [];
      
      // Determine additions and removals
      const toAdd = selectedAdmins.filter(id => !currentUserIds.includes(id));
      const toRemove = currentUserIds.filter(id => !selectedAdmins.includes(id));

      // Remove access
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from("account_access")
          .delete()
          .eq("account_id", account.id)
          .in("user_id", toRemove);

        if (removeError) throw removeError;
      }

      // Add access
      if (toAdd.length > 0) {
        const accessRecords = toAdd.map(userId => ({
          account_id: account.id,
          user_id: userId,
          granted_by: session?.user?.id
        }));

        const { error: addError } = await supabase
          .from("account_access")
          .insert(accessRecords);

        if (addError) throw addError;
      }

      toast.success("Access updated successfully");
      onOpenChange(false);
      onAccessUpdated();
    } catch (error: any) {
      console.error("Error updating access:", error);
      toast.error(error.message || "Failed to update access");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage Access - {account.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <Label>Select admin profiles to grant access:</Label>
            
            {adminProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                No admin profiles found. Create admin users first.
              </p>
            ) : (
              <div className="border rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
                {adminProfiles.map((profile) => (
                  <div key={profile.id} className="flex items-center space-x-3 py-1">
                    <Checkbox
                      id={`manage-admin-${profile.id}`}
                      checked={selectedAdmins.includes(profile.id)}
                      onCheckedChange={() => toggleAdminSelection(profile.id)}
                    />
                    <label 
                      htmlFor={`manage-admin-${profile.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      <span className="font-medium">
                        {profile.full_name || "Unnamed Admin"}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {profile.email}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Selected admins can view this account's stores and reports
            </p>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                className="flex-1" 
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
