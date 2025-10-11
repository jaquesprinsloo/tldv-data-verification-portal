import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";

interface Store {
  id: string;
  store_name: string;
  store_code: string;
}

interface MultiStoreAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  onSuccess: () => void;
}

export function MultiStoreAssignmentDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  onSuccess,
}: MultiStoreAssignmentDialogProps) {
  const { toast } = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchStoresAndAssignments();
    }
  }, [open, employeeId]);

  const fetchStoresAndAssignments = async () => {
    // Fetch all stores
    const { data: storesData, error: storesError } = await supabase
      .from('stores')
      .select('*')
      .order('store_name');

    if (storesError) {
      console.error('Error fetching stores:', storesError);
      return;
    }

    setStores(storesData || []);

    // Fetch current assignments
    const { data: assignmentsData, error: assignmentsError } = await supabase
      .from('employee_store_assignments')
      .select('store_id')
      .eq('employee_id', employeeId);

    if (assignmentsError) {
      console.error('Error fetching assignments:', assignmentsError);
      return;
    }

    setSelectedStores(assignmentsData?.map(a => a.store_id) || []);
  };

  const handleToggleStore = (storeId: string) => {
    setSelectedStores(prev =>
      prev.includes(storeId)
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    );
  };

  const handleSave = async () => {
    setLoading(true);

    try {
      // Delete all existing assignments
      const { error: deleteError } = await supabase
        .from('employee_store_assignments')
        .delete()
        .eq('employee_id', employeeId);

      if (deleteError) throw deleteError;

      // Insert new assignments
      if (selectedStores.length > 0) {
        const assignments = selectedStores.map(storeId => ({
          employee_id: employeeId,
          store_id: storeId,
        }));

        const { error: insertError } = await supabase
          .from('employee_store_assignments')
          .insert(assignments);

        if (insertError) throw insertError;
      }

      toast({
        title: "Assignments Updated",
        description: `Store assignments for ${employeeName} have been updated.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating assignments:', error);
      toast({
        title: "Error",
        description: "Failed to update store assignments.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Multiple Stores</DialogTitle>
          <DialogDescription>
            Select stores for {employeeName} to manage
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {stores.map((store) => (
              <div key={store.id} className="flex items-center space-x-2">
                <Checkbox
                  id={store.id}
                  checked={selectedStores.includes(store.id)}
                  onCheckedChange={() => handleToggleStore(store.id)}
                />
                <Label
                  htmlFor={store.id}
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  {store.store_name} ({store.store_code})
                </Label>
              </div>
            ))}
            {stores.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No stores available. Add stores first.
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Assignments'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
