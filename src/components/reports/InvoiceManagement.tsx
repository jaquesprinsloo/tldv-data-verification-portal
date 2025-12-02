import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileText, Eye, Plus, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

interface InvoiceManagementProps {
  storeId: string;
  dateFilter: "week" | "month" | "year" | "all";
  canEdit?: boolean;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  subtotal: number;
  vat_amount: number;
  discount_amount: number;
  total_amount: number;
  invoice_url: string | null;
  extracted_data: any;
}

export const InvoiceManagement = ({ storeId, dateFilter, canEdit = false }: InvoiceManagementProps) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [newInvoice, setNewInvoice] = useState({
    invoice_number: "",
    invoice_date: "",
    subtotal: "",
    vat_amount: "",
    discount_amount: "",
    total_amount: ""
  });

  const getDateRange = (filter: string) => {
    const now = new Date();
    switch (filter) {
      case "week":
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "year":
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return { start: null, end: null };
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [storeId, dateFilter]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(dateFilter);

      let query = supabase
        .from("invoices")
        .select("*")
        .eq("store_id", storeId)
        .order("invoice_date", { ascending: false });

      if (start && end) {
        query = query
          .gte("invoice_date", format(start, "yyyy-MM-dd"))
          .lte("invoice_date", format(end, "yyyy-MM-dd"));
      }

      const { data, error } = await query;
      if (error) throw error;

      setInvoices(data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }

    setUploading(true);
    try {
      // Upload file to storage
      const fileName = `${storeId}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get signed URL (bucket is private)
      const { data: { signedUrl } } = await supabase.storage
        .from("invoices")
        .createSignedUrl(fileName, 3600);

      toast.success("Invoice uploaded successfully. Please enter the details manually.");
      
      // Pre-fill the form
      setNewInvoice({
        ...newInvoice,
        invoice_date: format(new Date(), "yyyy-MM-dd")
      });
      
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload invoice");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!newInvoice.invoice_number || !newInvoice.invoice_date || !newInvoice.total_amount) {
      toast.error("Invoice number, date, and total amount are required");
      return;
    }

    try {
      const { error } = await supabase.from("invoices").insert([{
        store_id: storeId,
        invoice_number: newInvoice.invoice_number,
        invoice_date: newInvoice.invoice_date,
        subtotal: parseFloat(newInvoice.subtotal) || 0,
        vat_amount: parseFloat(newInvoice.vat_amount) || 0,
        discount_amount: parseFloat(newInvoice.discount_amount) || 0,
        total_amount: parseFloat(newInvoice.total_amount) || 0
      }]);

      if (error) throw error;

      toast.success("Invoice created successfully");
      setDialogOpen(false);
      setNewInvoice({
        invoice_number: "",
        invoice_date: "",
        subtotal: "",
        vat_amount: "",
        discount_amount: "",
        total_amount: ""
      });
      fetchInvoices();
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      toast.error(error.message || "Failed to create invoice");
    }
  };

  const calculateTotals = () => {
    return invoices.reduce(
      (acc, inv) => ({
        subtotal: acc.subtotal + Number(inv.subtotal),
        vat: acc.vat + Number(inv.vat_amount),
        discount: acc.discount + Number(inv.discount_amount),
        total: acc.total + Number(inv.total_amount)
      }),
      { subtotal: 0, vat: 0, discount: 0, total: 0 }
    );
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Subtotal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">R {totals.subtotal.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">VAT</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">R {totals.vat.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Discount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">R {totals.discount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">R {totals.total.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Invoices</CardTitle>
            {canEdit ? (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Invoice
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Invoice</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Upload PDF Invoice
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Upload a PDF to attach to this invoice
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="invoice_number">Invoice Number *</Label>
                        <Input
                          id="invoice_number"
                          value={newInvoice.invoice_number}
                          onChange={(e) => setNewInvoice({ ...newInvoice, invoice_number: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="invoice_date">Invoice Date *</Label>
                        <Input
                          id="invoice_date"
                          type="date"
                          value={newInvoice.invoice_date}
                          onChange={(e) => setNewInvoice({ ...newInvoice, invoice_date: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="subtotal">Subtotal (R)</Label>
                        <Input
                          id="subtotal"
                          type="number"
                          step="0.01"
                          value={newInvoice.subtotal}
                          onChange={(e) => setNewInvoice({ ...newInvoice, subtotal: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="vat_amount">VAT (R)</Label>
                        <Input
                          id="vat_amount"
                          type="number"
                          step="0.01"
                          value={newInvoice.vat_amount}
                          onChange={(e) => setNewInvoice({ ...newInvoice, vat_amount: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="discount_amount">Discount (R)</Label>
                        <Input
                          id="discount_amount"
                          type="number"
                          step="0.01"
                          value={newInvoice.discount_amount}
                          onChange={(e) => setNewInvoice({ ...newInvoice, discount_amount: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="total_amount">Total Amount (R) *</Label>
                        <Input
                          id="total_amount"
                          type="number"
                          step="0.01"
                          value={newInvoice.total_amount}
                          onChange={(e) => setNewInvoice({ ...newInvoice, total_amount: e.target.value })}
                        />
                      </div>
                    </div>

                    <Button onClick={handleCreateInvoice} className="w-full">
                      Create Invoice
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                View Only
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No invoices found</p>
            </div>
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
                    <TableCell>{format(new Date(invoice.invoice_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right">R {Number(invoice.subtotal).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">R {Number(invoice.vat_amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right text-green-600">R {Number(invoice.discount_amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-bold">R {Number(invoice.total_amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedInvoice(invoice)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice {selectedInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p className="font-medium">{format(new Date(selectedInvoice.invoice_date), "dd MMMM yyyy")}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Invoice Number</Label>
                  <p className="font-medium">{selectedInvoice.invoice_number}</p>
                </div>
              </div>
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>R {Number(selectedInvoice.subtotal).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT</span>
                  <span>R {Number(selectedInvoice.vat_amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-green-600">-R {Number(selectedInvoice.discount_amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>Total</span>
                  <span>R {Number(selectedInvoice.total_amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              {selectedInvoice.invoice_url && canEdit && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={selectedInvoice.invoice_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-2" />
                    View PDF
                  </a>
                </Button>
              )}
              {selectedInvoice.invoice_url && !canEdit && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2 border rounded-md">
                  <Lock className="h-4 w-4" />
                  PDF download restricted to master profile
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
