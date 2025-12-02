import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Building2, Search } from "lucide-react";
import { toast } from "sonner";

interface Account {
  id: string;
  name: string;
  code: string;
  contact_email: string | null;
  contact_phone: string | null;
  stores_count?: number;
}

interface AccountSelectorProps {
  onSelectAccount: (account: Account) => void;
  canEdit?: boolean;
}

export const AccountSelector = ({ onSelectAccount, canEdit = false }: AccountSelectorProps) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: "",
    code: "",
    contact_email: "",
    contact_phone: "",
    address: ""
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const { data: accountsData, error } = await supabase
        .from("accounts")
        .select("*")
        .order("name");

      if (error) throw error;

      // Get store counts for each account
      const accountsWithCounts = await Promise.all(
        (accountsData || []).map(async (account) => {
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

  const handleCreateAccount = async () => {
    if (!newAccount.name || !newAccount.code) {
      toast.error("Name and code are required");
      return;
    }

    try {
      const { error } = await supabase
        .from("accounts")
        .insert([newAccount]);

      if (error) throw error;

      toast.success("Account created successfully");
      setDialogOpen(false);
      setNewAccount({ name: "", code: "", contact_email: "", contact_phone: "", address: "" });
      fetchAccounts();
    } catch (error: any) {
      console.error("Error creating account:", error);
      toast.error(error.message || "Failed to create account");
    }
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
            <DialogContent>
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
                <div>
                  <Label htmlFor="email">Contact Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newAccount.contact_email}
                    onChange={(e) => setNewAccount({ ...newAccount, contact_email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Contact Phone</Label>
                  <Input
                    id="phone"
                    value={newAccount.contact_phone}
                    onChange={(e) => setNewAccount({ ...newAccount, contact_phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={newAccount.address}
                    onChange={(e) => setNewAccount({ ...newAccount, address: e.target.value })}
                  />
                </div>
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
            <p className="text-muted-foreground">No accounts found</p>
            {canEdit && (
              <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
                Create your first account
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((account) => (
            <Card
              key={account.id}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => onSelectAccount(account)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {account.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">Code: {account.code}</p>
                <p className="text-sm font-medium">{account.stores_count} Store(s)</p>
                {account.contact_email && (
                  <p className="text-xs text-muted-foreground mt-2">{account.contact_email}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
