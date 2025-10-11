import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, Plus, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Store {
  id: string;
  store_name: string;
  store_code: string;
}

interface StoreManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StoreManagementDialog({ open, onOpenChange }: StoreManagementDialogProps) {
  const { toast } = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeCode, setStoreCode] = useState("");

  useEffect(() => {
    if (open) {
      fetchStores();
    }
  }, [open]);

  const fetchStores = async () => {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('store_name');

    if (error) {
      console.error('Error fetching stores:', error);
      return;
    }

    setStores(data || []);
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Generate store code from store name if not provided
      const code = storeCode || storeName.toUpperCase().replace(/\s+/g, '_').substring(0, 20);
      
      const { error } = await supabase
        .from('stores')
        .insert({ store_name: storeName, store_code: code });

      if (error) throw error;

      toast({
        title: "Store Added",
        description: `${storeName} has been added successfully.`,
      });

      setStoreName("");
      setStoreCode("");
      fetchStores();
    } catch (error) {
      console.error('Error adding store:', error);
      toast({
        title: "Error",
        description: "Failed to add store. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStore = async (id: string) => {
    if (!confirm('Are you sure you want to delete this store?')) return;

    try {
      const { error } = await supabase
        .from('stores')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Store Deleted",
        description: "Store has been removed successfully.",
      });

      fetchStores();
    } catch (error) {
      console.error('Error deleting store:', error);
      toast({
        title: "Error",
        description: "Failed to delete store. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const text = await file.text();
      console.log('CSV file content:', text);
      
      const lines = text.split('\n').filter(line => line.trim());
      console.log('Lines:', lines);
      
      const headers = lines[0].split(',').map(h => h.trim());
      console.log('Headers:', headers);

      const storeNameIndex = headers.findIndex(h => 
        h.toLowerCase().includes('store') && h.toLowerCase().includes('name') || 
        h.toLowerCase() === 'name'
      );
      
      console.log('Store name index:', storeNameIndex);
      
      if (storeNameIndex === -1) {
        throw new Error('CSV must contain a "Store Name" or "Name" column');
      }

      const storesToInsert = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',').map(v => v.trim());
        const name = values[storeNameIndex];
        
        if (name) {
          // Generate store code from name
          const code = name.toUpperCase().replace(/\s+/g, '_').substring(0, 20);
          storesToInsert.push({ store_name: name, store_code: code });
        }
      }

      console.log('Stores to insert:', storesToInsert);

      if (storesToInsert.length === 0) {
        throw new Error('No valid stores found in CSV');
      }

      const { error } = await supabase
        .from('stores')
        .insert(storesToInsert);

      if (error) throw error;

      toast({
        title: "Stores Imported",
        description: `Successfully imported ${storesToInsert.length} stores.`,
      });

      fetchStores();
    } catch (error) {
      console.error('Error importing CSV:', error);
      toast({
        title: "Import Error",
        description: error instanceof Error ? error.message : "Failed to import stores.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleDownloadTemplate = () => {
    const csv = 'Store Name\n"Example Store 1"\n"Example Store 2"';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'store_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Stores</DialogTitle>
          <DialogDescription>
            Add stores manually or import from CSV
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            <div>
              <Input
                id="store-csv-upload"
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
              />
              <Label 
                htmlFor="store-csv-upload"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                Import CSV
              </Label>
            </div>
          </div>

          <form onSubmit={handleAddStore} className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Store Name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </form>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store Name</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No stores added yet
                    </TableCell>
                  </TableRow>
                ) : (
                  stores.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell>{store.store_name}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteStore(store.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
