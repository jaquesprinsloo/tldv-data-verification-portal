import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Building2, Search, Users, Settings } from "lucide-react";
import { toast } from "sonner";
import { ManageAccessDialog } from "./ManageAccessDialog";

interface Account {
  id: string;
  name: string;
  code: string;
  contact_email: string | null;
  contact_phone: string | null;
  stores_count?: number;
}

interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
}

interface AccountSelectorProps {
  onSelectAccount: (account: Account) => void;
  canEdit?: boolean;
  currentUserId?: string;
  isMasterAdmin?: boolean;
}

export const AccountSelector = ({ 
  onSelectAccount, 
  canEdit = false, 
  currentUserId,
  isMasterAdmin = false 
}: AccountSelectorProps) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const [newAccount, setNewAccount] = useState({
    name: "",
    code: ""
  });
  const [manageAccessAccount, setManageAccessAccount] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchAccounts();
    if (canEdit) {
      fetchAdminProfiles();
    }
  }, [canEdit]);

  const fetchAccounts = async () => {
    try {
      let accountsData: Account[] = [];

      if (isMasterAdmin) {
        // Master admin sees all accounts
        const { data, error } = await supabase
          .from("accounts")
          .select("*")
          .order("name");

        if (error) throw error;
        accountsData = data || [];
      } else if (currentUserId) {
        // Admin only sees accounts they have access to
        const { data: accessData, error: accessError } = await supabase
          .from("account_access")
          .select("account_id")
          .eq("user_id", currentUserId);

        if (accessError) throw accessError;

        if (accessData && accessData.length > 0) {
          const accountIds = accessData.map(a => a.account_id);
          const { data, error } = await supabase
            .from("accounts")
            .select("*")
            .in("id", accountIds)
            .order("name");

          if (error) throw error;
          accountsData = data || [];
        }
      }

      // Get store counts for each account
      const accountsWithCounts = await Promise.all(
        accountsData.map(async (account) => {
          const { count } = await supabase
            .from("stores")
            .select("*", { count: "exact", head: true })
            .eq("account_id", account.id);
          
          return { ...account, stores_count: count || 0 };
        })
      );

      setAccounts(accountsWithCounts);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast.error("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminProfiles = async () => {
    try {
      // Get all users with admin role
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
    } catch (error) {
      console.error("Error fetching admin profiles:", error);
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccount.name || !newAccount.code) {
      toast.error("Account name and code are required");
      return;
    }

    try {
      // Create the account
      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .insert([{ name: newAccount.name, code: newAccount.code }])
        .select()
        .single();

      if (accountError) throw accountError;

      // Add access for selected admins
      if (selectedAdmins.length > 0 && accountData) {
        const { data: { session } } = await supabase.auth.getSession();
        const accessRecords = selectedAdmins.map(userId => ({
          account_id: accountData.id,
          user_id: userId,
          granted_by: session?.user?.id
        }));

        const { error: accessError } = await supabase
          .from("account_access")
          .insert(accessRecords);

        if (accessError) {
          console.error("Error granting access:", accessError);
          toast.error("Account created but failed to grant admin access");
        }
      }

      toast.success("Account created successfully");
      setDialogOpen(false);
      setNewAccount({ name: "", code: "" });
      setSelectedAdmins([]);
      fetchAccounts();
    } catch (error: any) {
      console.error("Error creating account:", error);
      toast.error(error.message || "Failed to create account");
    }
  };

  const toggleAdminSelection = (userId: string) => {
    setSelectedAdmins(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const filteredAccounts = accounts.filter(
    (account) =>
      account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Account
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Account Name *</Label>
                  <Input
                    id="name"
                    value={newAccount.name}
                    onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                    placeholder="e.g., Cash Crusaders"
                  />
                </div>
                <div>
                  <Label htmlFor="code">Account Code *</Label>
                  <Input
                    id="code"
                    value={newAccount.code}
                    onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
                    placeholder="e.g., CC001"
                  />
                </div>

                {/* Admin Access Selection */}
                {adminProfiles.length > 0 && (
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Grant Access to Admin Profiles
                    </Label>
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                      {adminProfiles.map((profile) => (
                        <div key={profile.id} className="flex items-center space-x-3">
                          <Checkbox
                            id={`admin-${profile.id}`}
                            checked={selectedAdmins.includes(profile.id)}
                            onCheckedChange={() => toggleAdminSelection(profile.id)}
                          />
                          <label 
                            htmlFor={`admin-${profile.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            <span className="font-medium">
                              {profile.full_name || "Unnamed Admin"}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              ({profile.email})
                            </span>
                          </label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Selected admins will be able to view this account's reports
                    </p>
                  </div>
                )}

                {adminProfiles.length === 0 && (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                    No admin profiles found. Create admin users first to grant access.
                  </p>
                )}

                <Button onClick={handleCreateAccount} className="w-full">
                  Create Account
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {filteredAccounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {isMasterAdmin ? "No accounts found" : "No accounts assigned to you"}
            </p>
            {canEdit && (
              <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
                Create your first account
              </Button>
            )}
            {!canEdit && !isMasterAdmin && (
              <p className="text-sm text-muted-foreground mt-2">
                Contact the master admin to get access to accounts
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((account) => (
            <Card
              key={account.id}
              className="cursor-pointer hover:border-primary transition-colors group"
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <div 
                    className="flex items-center gap-2 flex-1"
                    onClick={() => onSelectAccount(account)}
                  >
                    <Building2 className="h-5 w-5 text-primary" />
                    {account.name}
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setManageAccessAccount({ id: account.id, name: account.name });
                      }}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent onClick={() => onSelectAccount(account)}>
                <p className="text-sm text-muted-foreground mb-2">Code: {account.code}</p>
                <p className="text-sm font-medium">{account.stores_count} Sub Account(s)</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Manage Access Dialog */}
      {manageAccessAccount && (
        <ManageAccessDialog
          open={!!manageAccessAccount}
          onOpenChange={(open) => !open && setManageAccessAccount(null)}
          account={manageAccessAccount}
          onAccessUpdated={fetchAccounts}
        />
      )}
    </div>
  );
};
