import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Upload, FileText, Plus, DollarSign, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface StoreInvoicesTabProps {
  storeId: string;
  canEdit: boolean;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  subtotal: number;
  vat_amount: number;
  discount_amount: number;
  total_amount: number;
  polygraph_amount: number;
  risk_assessment_amount: number;
  travel_amount: number;
  tolls_amount: number;
  accommodation_amount: number;
  other_amount: number;
  invoice_url: string | null;
}

export const StoreInvoicesTab = ({ storeId, canEdit }: StoreInvoicesTabProps) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    subtotal: "",
    vat_amount: "",
    discount_amount: "",
    total_amount: "",
    polygraph_amount: "",
    risk_assessment_amount: "",
    travel_amount: "",
    tolls_amount: "",
    accommodation_amount: "",
    other_amount: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // extraction removed — manual entry only
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resetForm = () => {
    setFormData({
      invoice_number: "",
      invoice_date: new Date().toISOString().split("T")[0],
      subtotal: "",
      vat_amount: "",
      discount_amount: "",
      total_amount: "",
      polygraph_amount: "",
      risk_assessment_amount: "",
      travel_amount: "",
      tolls_amount: "",
      accommodation_amount: "",
      other_amount: "",
    });
    setSelectedFile(null);
  };

  useEffect(() => {
    fetchInvoices();
  }, [storeId]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("store_id", storeId)
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      toast.error("Please select a PDF file");
      return;
    }

    setSelectedFile(file);
    toast.success("File selected — please enter the invoice details below");
  };

  const handleUploadInvoice = async () => {
    if (!formData.invoice_number || !formData.invoice_date) {
      toast.error("Please fill in required fields");
      return;
    }

    setUploading(true);
    try {
      let invoiceUrl = null;

      if (selectedFile) {
        const fileName = `${storeId}/${Date.now()}_${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("invoices")
          .upload(fileName, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from("invoices").getPublicUrl(fileName);
        invoiceUrl = publicUrl;
      }

      const { error } = await supabase.from("invoices").insert({
        store_id: storeId,
        invoice_number: formData.invoice_number,
        invoice_date: formData.invoice_date,
        subtotal: parseFloat(formData.subtotal) || 0,
        vat_amount: parseFloat(formData.vat_amount) || 0,
        discount_amount: parseFloat(formData.discount_amount) || 0,
        total_amount: parseFloat(formData.total_amount) || 0,
        polygraph_amount: parseFloat(formData.polygraph_amount) || 0,
        risk_assessment_amount: parseFloat(formData.risk_assessment_amount) || 0,
        travel_amount: parseFloat(formData.travel_amount) || 0,
        tolls_amount: parseFloat(formData.tolls_amount) || 0,
        accommodation_amount: parseFloat(formData.accommodation_amount) || 0,
        other_amount: parseFloat(formData.other_amount) || 0,
        invoice_url: invoiceUrl,
      });

      if (error) throw error;

      toast.success("Invoice added successfully");
      setUploadDialogOpen(false);
      setFormData({
        invoice_number: "",
        invoice_date: new Date().toISOString().split("T")[0],
        subtotal: "",
        vat_amount: "",
        discount_amount: "",
        total_amount: "",
        polygraph_amount: "",
        risk_assessment_amount: "",
        travel_amount: "",
        tolls_amount: "",
        accommodation_amount: "",
        other_amount: "",
      });
      setSelectedFile(null);
      fetchInvoices();
    } catch (error: any) {
      console.error("Error uploading invoice:", error);
      toast.error(error.message || "Failed to upload invoice");
    } finally {
      setUploading(false);
    }
  };

  const calculateTotals = () => {
    return invoices.reduce(
      (acc, inv) => ({
        subtotal: acc.subtotal + (inv.subtotal || 0),
        vat: acc.vat + (inv.vat_amount || 0),
        discount: acc.discount + (inv.discount_amount || 0),
        total: acc.total + (inv.total_amount || 0),
      }),
      { subtotal: 0, vat: 0, discount: 0, total: 0 }
    );
  };

  const totals = calculateTotals();

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setViewDialogOpen(true);
  };

  const handleDeleteClick = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setDeleteDialogOpen(true);
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    
    setDeleting(true);
    try {
      // Delete from storage if there's a file
      if (invoiceToDelete.invoice_url) {
        const urlParts = invoiceToDelete.invoice_url.split("/invoices/");
        if (urlParts[1]) {
          await supabase.storage.from("invoices").remove([urlParts[1]]);
        }
      }

      // Delete from database
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceToDelete.id);

      if (error) throw error;

      toast.success("Invoice deleted successfully");
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
      fetchInvoices();
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      toast.error(error.message || "Failed to delete invoice");
    } finally {
      setDeleting(false);
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
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Subtotal</p>
            <p className="text-xl font-bold">R {totals.subtotal.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">VAT</p>
            <p className="text-xl font-bold">R {totals.vat.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Discount</p>
            <p className="text-xl font-bold">R {totals.discount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-primary">R {totals.total.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Invoices
          </CardTitle>
          {canEdit && (
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Invoice
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No invoices uploaded</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{format(new Date(invoice.invoice_date), "PP")}</TableCell>
                    <TableCell className="text-right">R {invoice.subtotal.toLocaleString()}</TableCell>
                    <TableCell className="text-right">R {invoice.vat_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">R {invoice.discount_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">R {invoice.total_amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleViewInvoice(invoice)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {invoice.invoice_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={invoice.invoice_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {canEdit && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteClick(invoice)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Number *</Label>
                <Input
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                  placeholder="e.g., INV-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.invoice_date}
                  onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subtotal (R)</Label>
                <Input
                  type="number"
                  value={formData.subtotal}
                  onChange={(e) => setFormData({ ...formData, subtotal: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>VAT (R)</Label>
                <Input
                  type="number"
                  value={formData.vat_amount}
                  onChange={(e) => setFormData({ ...formData, vat_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Expense Breakdown</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Polygraph Exams (R)</Label>
                  <Input
                    type="number"
                    value={formData.polygraph_amount}
                    onChange={(e) => setFormData({ ...formData, polygraph_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Risk Assessments (R)</Label>
                  <Input
                    type="number"
                    value={formData.risk_assessment_amount}
                    onChange={(e) => setFormData({ ...formData, risk_assessment_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Travel (R)</Label>
                  <Input
                    type="number"
                    value={formData.travel_amount}
                    onChange={(e) => setFormData({ ...formData, travel_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Tolls (R)</Label>
                  <Input
                    type="number"
                    value={formData.tolls_amount}
                    onChange={(e) => setFormData({ ...formData, tolls_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Accommodation (R)</Label>
                  <Input
                    type="number"
                    value={formData.accommodation_amount}
                    onChange={(e) => setFormData({ ...formData, accommodation_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Other (R)</Label>
                  <Input
                    type="number"
                    value={formData.other_amount}
                    onChange={(e) => setFormData({ ...formData, other_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Discount (R)</Label>
                <Input
                  type="number"
                  value={formData.discount_amount}
                  onChange={(e) => setFormData({ ...formData, discount_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Total (R)</Label>
                <Input
                  type="number"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Upload Invoice PDF (auto-extracts data)</Label>
              <input
                type="file"
                accept=".pdf"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
               />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {selectedFile ? selectedFile.name : "Select PDF"}
                </Button>
                {selectedFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetForm}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Upload a PDF and enter the invoice details below
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setUploadDialogOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleUploadInvoice} disabled={uploading}>
              {uploading ? "Saving..." : "Save Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Invoice Number</p>
                  <p className="font-medium">{selectedInvoice.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(selectedInvoice.invoice_date), "PP")}</p>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium mb-2">Expense Breakdown</p>
                {selectedInvoice.polygraph_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Polygraph Exams</span>
                    <span>R {selectedInvoice.polygraph_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedInvoice.risk_assessment_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Risk Assessments</span>
                    <span>R {selectedInvoice.risk_assessment_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedInvoice.travel_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Travel</span>
                    <span>R {selectedInvoice.travel_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedInvoice.tolls_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tolls</span>
                    <span>R {selectedInvoice.tolls_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedInvoice.accommodation_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Accommodation</span>
                    <span>R {selectedInvoice.accommodation_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedInvoice.other_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Other</span>
                    <span>R {selectedInvoice.other_amount.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>R {selectedInvoice.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT</span>
                  <span>R {selectedInvoice.vat_amount.toLocaleString()}</span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span>-R {selectedInvoice.discount_amount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>Total</span>
                  <span>R {selectedInvoice.total_amount.toLocaleString()}</span>
                </div>
              </div>

              {selectedInvoice.invoice_url && canEdit && (
                <Button asChild className="w-full">
                  <a href={selectedInvoice.invoice_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-2" />
                    Download PDF
                  </a>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice "{invoiceToDelete?.invoice_number}"? 
              This action cannot be undone and will also remove the associated PDF file if present.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteInvoice} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
