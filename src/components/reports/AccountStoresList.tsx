import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, MapPin, Building, Plus, Users, Upload, Download, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
interface SubAccount {
  id: string;
  store_name: string;
  store_code: string;
  town: string | null;
  province: string | null;
  account_id: string | null;
  center_mall_name: string | null;
  street_number: string | null;
  street_name: string | null;
  postal_code: string | null;
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
  onSelectStore: (store: SubAccount) => void;
  canEdit?: boolean;
}

export const AccountStoresList = ({ account, onBack, onSelectStore, canEdit = false }: AccountStoresListProps) => {
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [availableSubAccounts, setAvailableSubAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSubAccountId, setSelectedSubAccountId] = useState("");
  const [newSubAccount, setNewSubAccount] = useState({
    name: "",
    address: ""
  });
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSubAccounts();
    fetchAvailableSubAccounts();
  }, [account.id]);

  const fetchSubAccounts = async () => {
    try {
      const { data: subAccountsData, error } = await supabase
        .from("stores")
        .select("*")
        .eq("account_id", account.id)
        .order("store_name");

      if (error) throw error;

      // Get employee and examination counts for each sub account
      const subAccountsWithCounts = await Promise.all(
        (subAccountsData || []).map(async (subAccount) => {
          const [employeesResult, examsResult] = await Promise.all([
            supabase
              .from("employees")
              .select("*", { count: "exact", head: true })
              .eq("store_id", subAccount.id),
            supabase
              .from("examinations")
              .select("*", { count: "exact", head: true })
              .eq("store_id", subAccount.id)
          ]);

          return {
            ...subAccount,
            employees_count: employeesResult.count || 0,
            examinations_count: examsResult.count || 0
          };
        })
      );

      setSubAccounts(subAccountsWithCounts);
    } catch (error) {
      console.error("Error fetching sub accounts:", error);
      toast.error("Failed to load sub accounts");
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSubAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .is("account_id", null)
        .order("store_name");

      if (error) throw error;
      setAvailableSubAccounts(data || []);
    } catch (error) {
      console.error("Error fetching available sub accounts:", error);
    }
  };

  const handleAssignSubAccount = async () => {
    if (!selectedSubAccountId) {
      toast.error("Please select a sub account");
      return;
    }

    try {
      const { error } = await supabase
        .from("stores")
        .update({ account_id: account.id })
        .eq("id", selectedSubAccountId);

      if (error) throw error;

      toast.success("Sub account assigned to account");
      setDialogOpen(false);
      setSelectedSubAccountId("");
      fetchSubAccounts();
      fetchAvailableSubAccounts();
    } catch (error: any) {
      console.error("Error assigning sub account:", error);
      toast.error(error.message || "Failed to assign sub account");
    }
  };

  const handleCreateSubAccount = async () => {
    if (!newSubAccount.name) {
      toast.error("Sub account name is required");
      return;
    }

    try {
      const code = generateCode(newSubAccount.name);
      
      const { error } = await supabase
        .from("stores")
        .insert([{
          store_name: newSubAccount.name,
          store_code: code,
          street_name: newSubAccount.address || null,
          account_id: account.id
        }]);

      if (error) throw error;

      toast.success("Sub account created successfully");
      setCreateDialogOpen(false);
      setNewSubAccount({ name: "", address: "" });
      fetchSubAccounts();
    } catch (error: any) {
      console.error("Error creating sub account:", error);
      toast.error(error.message || "Failed to create sub account");
    }
  };

  const generateCode = (name: string) => {
    const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
    const timestamp = Date.now().toString().slice(-4);
    return `${prefix}${timestamp}`;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (isExcel) {
      // Handle Excel file
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          const subAccountsToInsert: Array<{
            store_name: string;
            store_code: string;
            street_name: string | null;
            account_id: string;
          }> = [];

          // Process all sheets
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
            
            if (jsonData.length < 2) continue;
            
            const headers = (jsonData[0] || []).map(h => String(h || '').toLowerCase().trim());
            const nameIndex = headers.findIndex(h => 
              h.includes('name') || h.includes('store') || h.includes('sub account') || h.includes('branch')
            );
            const addressIndex = headers.findIndex(h => h.includes('address'));

            if (nameIndex === -1) continue;

            for (let i = 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              const name = String(row[nameIndex] || '').trim();
              
              if (!name) continue;

              subAccountsToInsert.push({
                store_name: name,
                store_code: generateCode(name),
                street_name: addressIndex !== -1 ? String(row[addressIndex] || '').trim() || null : null,
                account_id: account.id
              });
            }
          }

          if (subAccountsToInsert.length === 0) {
            toast.error("No valid sub accounts found in Excel file. Ensure there's a 'Name' or 'Store' column.");
            return;
          }

          const { error } = await supabase
            .from("stores")
            .insert(subAccountsToInsert);

          if (error) throw error;

          toast.success(`Successfully imported ${subAccountsToInsert.length} sub accounts from ${workbook.SheetNames.length} sheet(s)`);
          fetchSubAccounts();
        } catch (error: any) {
          console.error("Error importing Excel:", error);
          toast.error(error.message || "Failed to import Excel file");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Handle CSV file
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split("\n").filter(line => line.trim());
          
          if (lines.length < 2) {
            toast.error("CSV file must have a header row and at least one data row");
            return;
          }

          const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/"/g, ""));
          const nameIndex = headers.findIndex(h => h.includes("name") || h.includes("sub account"));
          const addressIndex = headers.findIndex(h => h.includes("address"));

          if (nameIndex === -1) {
            toast.error("CSV must have a 'Name' or 'Sub Account Name' column");
            return;
          }

          const subAccountsToInsert = [];
          
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
            const name = values[nameIndex];
            
            if (!name) continue;

            subAccountsToInsert.push({
              store_name: name,
              store_code: generateCode(name),
              street_name: addressIndex !== -1 ? values[addressIndex] || null : null,
              account_id: account.id
            });
          }

          if (subAccountsToInsert.length === 0) {
            toast.error("No valid sub accounts found in CSV");
            return;
          }

          const { error } = await supabase
            .from("stores")
            .insert(subAccountsToInsert);

          if (error) throw error;

          toast.success(`Successfully imported ${subAccountsToInsert.length} sub accounts`);
          fetchSubAccounts();
        } catch (error: any) {
          console.error("Error importing CSV:", error);
          toast.error(error.message || "Failed to import CSV");
        }
      };
      reader.readAsText(file);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDownloadTemplate = () => {
    // Create Excel workbook with proper template
    const wb = XLSX.utils.book_new();
    const wsData = [
      ["Sub Account Name", "Address"],
      ["Branch Johannesburg", "123 Main Street, Johannesburg, Gauteng"],
      ["Branch Cape Town", "456 Long Street, Cape Town, Western Cape"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    ws['!cols'] = [{ wch: 30 }, { wch: 50 }];
    
    XLSX.utils.book_append_sheet(wb, ws, "Sub Accounts");
    XLSX.writeFile(wb, "sub_accounts_template.xlsx");
  };

  const toggleSelectForDelete = (id: string) => {
    const newSelected = new Set(selectedForDelete);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedForDelete(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedForDelete.size === subAccounts.length) {
      setSelectedForDelete(new Set());
    } else {
      setSelectedForDelete(new Set(subAccounts.map(s => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedForDelete.size === 0) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("stores")
        .delete()
        .in("id", Array.from(selectedForDelete));

      if (error) throw error;

      toast.success(`Successfully deleted ${selectedForDelete.size} sub account(s)`);
      setSelectedForDelete(new Set());
      setDeleteDialogOpen(false);
      fetchSubAccounts();
    } catch (error: any) {
      console.error("Error deleting sub accounts:", error);
      toast.error(error.message || "Failed to delete sub accounts");
    } finally {
      setIsDeleting(false);
    }
  };

  const getGoogleMapsUrl = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    return `https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}&q=${encodedAddress}&zoom=15`;
  };

  const getFullAddress = (subAccount: SubAccount) => {
    const parts = [
      subAccount.street_name,
      subAccount.town,
      subAccount.province
    ].filter(Boolean);
    return parts.join(", ");
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
      <div className="flex items-center justify-between flex-wrap gap-4">
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
        {canEdit && (
          <div className="flex items-center gap-2">
            {/* File Upload */}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              ref={fileInputRef}
              className="hidden"
            />
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Template
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV/Excel
            </Button>

            {/* Create New Sub Account */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Sub Account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Sub Account</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Sub Account Name *</Label>
                    <Input
                      value={newSubAccount.name}
                      onChange={(e) => setNewSubAccount({ ...newSubAccount, name: e.target.value })}
                      placeholder="e.g., Branch Johannesburg"
                    />
                  </div>
                  <div>
                    <Label>Physical Address</Label>
                    <Input
                      value={newSubAccount.address}
                      onChange={(e) => setNewSubAccount({ ...newSubAccount, address: e.target.value })}
                      placeholder="e.g., 123 Main Street, Johannesburg, Gauteng"
                    />
                  </div>
                  <Button onClick={handleCreateSubAccount} className="w-full">
                    Create Sub Account
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Assign Existing Sub Account */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <FileText className="h-4 w-4 mr-2" />
                  Assign Sub Account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Sub Account to {account.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Select Sub Account</Label>
                    <Select value={selectedSubAccountId} onValueChange={setSelectedSubAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sub account" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSubAccounts.map((subAccount) => (
                          <SelectItem key={subAccount.id} value={subAccount.id}>
                            {subAccount.store_name} ({subAccount.store_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {availableSubAccounts.length === 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        No unassigned sub accounts available
                      </p>
                    )}
                  </div>
                  <Button onClick={handleAssignSubAccount} className="w-full" disabled={!selectedSubAccountId}>
                    Assign Sub Account
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Selection toolbar */}
      {canEdit && subAccounts.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedForDelete.size === subAccounts.length && subAccounts.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              {selectedForDelete.size > 0 
                ? `${selectedForDelete.size} selected` 
                : "Select all"}
            </span>
          </div>
          {selectedForDelete.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedForDelete.size})
            </Button>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sub Accounts</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedForDelete.size} sub account(s)? 
              This action cannot be undone. Any employees assigned to these sub accounts 
              will have their store assignment removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {subAccounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No sub accounts assigned to this account</p>
            {canEdit && (
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                  Create a sub account
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(true)}>
                  Assign existing sub account
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subAccounts.map((subAccount) => (
            <Card
              key={subAccount.id}
              className={`cursor-pointer hover:border-primary transition-colors ${
                selectedForDelete.has(subAccount.id) ? "border-primary bg-primary/5" : ""
              }`}
              onClick={() => onSelectStore(subAccount)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {canEdit && (
                    <Checkbox
                      checked={selectedForDelete.has(subAccount.id)}
                      onCheckedChange={() => toggleSelectForDelete(subAccount.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <Building className="h-5 w-5 text-primary" />
                  {subAccount.store_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {getFullAddress(subAccount) && (
                  <>
                    <p className="text-sm flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {getFullAddress(subAccount)}
                    </p>
                    <div className="w-full h-24 rounded-md overflow-hidden border">
                      <iframe
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                        src={getGoogleMapsUrl(getFullAddress(subAccount))}
                      />
                    </div>
                  </>
                )}
                <div className="flex items-center gap-4 pt-3 border-t">
                  <div className="flex items-center gap-1 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{subAccount.employees_count} Employees</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">{subAccount.examinations_count}</span> Examinations
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
