import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, Store, Plus, Users } from "lucide-react";
import { toast } from "sonner";

interface Store {
  id: string;
  store_name: string;
  store_code: string;
  town: string | null;
  province: string | null;
  account_id: string | null;
  employees_count?: number;
  examinations_count?: number;
}

interface AccountStoresListProps {
  account: {
    id: string;
    name: string;
    code: string;
  };
  onBack: () => void;
  onSelectStore: (store: Store) => void;
}

export const AccountStoresList = ({ account, onBack, onSelectStore }: AccountStoresListProps) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [availableStores, setAvailableStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState("");

  useEffect(() => {
    fetchStores();
    fetchAvailableStores();
  }, [account.id]);

  const fetchStores = async () => {
    try {
      const { data: storesData, error } = await supabase
        .from("stores")
        .select("*")
        .eq("account_id", account.id)
        .order("store_name");

      if (error) throw error;

      // Get employee and examination counts for each store
      const storesWithCounts = await Promise.all(
        (storesData || []).map(async (store) => {
          const [employeesResult, examsResult] = await Promise.all([
            supabase
              .from("employees")
              .select("*", { count: "exact", head: true })
              .eq("store_id", store.id),
            supabase
              .from("examinations")
              .select("*", { count: "exact", head: true })
              .eq("store_id", store.id)
          ]);

          return {
            ...store,
            employees_count: employeesResult.count || 0,
            examinations_count: examsResult.count || 0
          };
        })
      );

      setStores(storesWithCounts);
    } catch (error) {
      console.error("Error fetching stores:", error);
      toast.error("Failed to load stores");
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableStores = async () => {
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .is("account_id", null)
        .order("store_name");

      if (error) throw error;
      setAvailableStores(data || []);
    } catch (error) {
      console.error("Error fetching available stores:", error);
    }
  };

  const handleAssignStore = async () => {
    if (!selectedStoreId) {
      toast.error("Please select a store");
      return;
    }

    try {
      const { error } = await supabase
        .from("stores")
        .update({ account_id: account.id })
        .eq("id", selectedStoreId);

      if (error) throw error;

      toast.success("Store assigned to account");
      setDialogOpen(false);
      setSelectedStoreId("");
      fetchStores();
      fetchAvailableStores();
    } catch (error: any) {
      console.error("Error assigning store:", error);
      toast.error(error.message || "Failed to assign store");
    }
  };

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
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{account.name}</h2>
            <p className="text-sm text-muted-foreground">Account Code: {account.code}</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Assign Store
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Store to {account.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Store</Label>
                <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a store" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.store_name} ({store.store_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableStores.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    No unassigned stores available
                  </p>
                )}
              </div>
              <Button onClick={handleAssignStore} className="w-full" disabled={!selectedStoreId}>
                Assign Store
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {stores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No stores assigned to this account</p>
            <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
              Assign a store
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((store) => (
            <Card
              key={store.id}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => onSelectStore(store)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Store className="h-5 w-5 text-primary" />
                  {store.store_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">Code: {store.store_code}</p>
                {store.town && (
                  <p className="text-sm flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {store.town}, {store.province}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{store.employees_count} Employees</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">{store.examinations_count}</span> Examinations
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
