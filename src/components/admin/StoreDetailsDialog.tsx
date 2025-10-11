import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StoreDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName: string;
}

export function StoreDetailsDialog({ open, onOpenChange, storeId, storeName }: StoreDetailsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    center_mall_name: "",
    shop_number: "",
    street_number: "",
    street_name: "",
    town: "",
    province: "",
    postal_code: "",
    contact_number: "",
  });

  useEffect(() => {
    if (open && storeId) {
      fetchStoreDetails();
    }
  }, [open, storeId]);

  const fetchStoreDetails = async () => {
    const { data, error } = await supabase
      .from('stores')
      .select('center_mall_name, shop_number, street_number, street_name, town, province, postal_code, contact_number')
      .eq('id', storeId)
      .single();

    if (error) {
      console.error('Error fetching store details:', error);
      return;
    }

    if (data) {
      setFormData({
        center_mall_name: data.center_mall_name || "",
        shop_number: data.shop_number || "",
        street_number: data.street_number || "",
        street_name: data.street_name || "",
        town: data.town || "",
        province: data.province || "",
        postal_code: data.postal_code || "",
        contact_number: data.contact_number || "",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('stores')
        .update(formData)
        .eq('id', storeId);

      if (error) throw error;

      toast({
        title: "Store Details Updated",
        description: `Details for ${storeName} have been saved successfully.`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error updating store details:', error);
      toast({
        title: "Error",
        description: "Failed to update store details. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Store Details - {storeName}</DialogTitle>
          <DialogDescription>
            Enter the physical address and contact information for this store
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="center_mall_name">Center/Mall Name</Label>
              <Input
                id="center_mall_name"
                value={formData.center_mall_name}
                onChange={(e) => setFormData({ ...formData, center_mall_name: e.target.value })}
                placeholder="e.g., Gateway Mall"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shop_number">Shop Number</Label>
              <Input
                id="shop_number"
                value={formData.shop_number}
                onChange={(e) => setFormData({ ...formData, shop_number: e.target.value })}
                placeholder="e.g., Shop 123"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="street_number">Street Number</Label>
              <Input
                id="street_number"
                value={formData.street_number}
                onChange={(e) => setFormData({ ...formData, street_number: e.target.value })}
                placeholder="e.g., 456"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="street_name">Street Name</Label>
              <Input
                id="street_name"
                value={formData.street_name}
                onChange={(e) => setFormData({ ...formData, street_name: e.target.value })}
                placeholder="e.g., Main Street"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="town">Town</Label>
              <Input
                id="town"
                value={formData.town}
                onChange={(e) => setFormData({ ...formData, town: e.target.value })}
                placeholder="e.g., Durban"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="province">Province</Label>
              <Input
                id="province"
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                placeholder="e.g., KwaZulu-Natal"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="postal_code">Postal Code</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="e.g., 4001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_number">Contact Number</Label>
              <Input
                id="contact_number"
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                placeholder="e.g., 031 123 4567"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              Save Details
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
