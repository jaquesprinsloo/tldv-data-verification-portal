import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Package, Eye, FileText, CheckCircle2, Link, Trash2, Receipt } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RiskProfileDialog } from "@/components/shared/RiskProfileDialog";

interface Batch {
  id: string;
  name: string | null;
  examination_date: string;
  status: string;
  total_reports: number;
  processed_reports: number;
  created_at: string;
  invoice_id: string | null;
  stores?: { store_name: string; store_code: string } | null;
  examiners?: { name: string } | null;
  invoices?: { invoice_number: string } | null;
}

interface BatchReport {
  id: string;
  first_name: string;
  last_name: string;
  id_number: string;
  overall_result: string | null;
  risk_level: string | null;
  status: string;
  report_pdf_url: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
}

const BatchListSection = () => {
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [batchReports, setBatchReports] = useState<BatchReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  
  // Invoice linking
  const [linkInvoiceOpen, setLinkInvoiceOpen] = useState(false);
  const [availableInvoices, setAvailableInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [linking, setLinking] = useState(false);

  // Risk profile dialog
  const [riskProfileOpen, setRiskProfileOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedCandidateName, setSelectedCandidateName] = useState("");

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from("polygraph_batches")
        .select(`
          *,
          stores(store_name, store_code),
          examiners(name),
          invoices(invoice_number)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBatches(data || []);
    } catch (error: any) {
      console.error("Error fetching batches:", error);
      toast({
        title: "Error",
        description: "Failed to load batches",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchReports = async (batchId: string) => {
    setLoadingReports(true);
    try {
      const { data, error } = await supabase
        .from("polygraph_reports")
        .select("id, first_name, last_name, id_number, overall_result, risk_level, status, report_pdf_url")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setBatchReports(data || []);
    } catch (error: any) {
      console.error("Error fetching batch reports:", error);
      toast({
        title: "Error",
        description: "Failed to load batch reports",
        variant: "destructive",
      });
    } finally {
      setLoadingReports(false);
    }
  };

  const handleViewBatch = (batch: Batch) => {
    setSelectedBatch(batch);
    fetchBatchReports(batch.id);
  };

  const handleApproveBatch = async () => {
    if (!selectedBatch) return;

    try {
      const { error } = await supabase
        .from("polygraph_batches")
        .update({ status: 'approved' })
        .eq("id", selectedBatch.id);

      if (error) throw error;

      toast({
        title: "Batch Approved",
        description: "All reports in this batch have been approved.",
      });

      setSelectedBatch({ ...selectedBatch, status: 'approved' });
      fetchBatches();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve batch",
        variant: "destructive",
      });
    }
  };

  const handleLinkInvoice = async () => {
    if (!selectedBatch || !selectedInvoiceId) return;

    setLinking(true);
    try {
      const { error } = await supabase
        .from("polygraph_batches")
        .update({ invoice_id: selectedInvoiceId })
        .eq("id", selectedBatch.id);

      if (error) throw error;

      toast({
        title: "Invoice Linked",
        description: "The invoice has been linked to this batch.",
      });

      setLinkInvoiceOpen(false);
      setSelectedInvoiceId("");
      fetchBatches();
      
      // Update selected batch
      const linkedInvoice = availableInvoices.find(i => i.id === selectedInvoiceId);
      if (linkedInvoice) {
        setSelectedBatch({
          ...selectedBatch,
          invoice_id: selectedInvoiceId,
          invoices: { invoice_number: linkedInvoice.invoice_number },
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to link invoice",
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  };

  const openLinkInvoiceDialog = async () => {
    if (!selectedBatch?.stores) return;

    // Fetch invoices for the store
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total_amount")
      .order("invoice_date", { ascending: false });

    setAvailableInvoices(data || []);
    setLinkInvoiceOpen(true);
  };

  const handleViewRiskProfile = (report: BatchReport) => {
    setSelectedReportId(report.id);
    setSelectedCandidateName(`${report.first_name} ${report.last_name}`);
    setRiskProfileOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary">Pending</Badge>;
      case 'processing': return <Badge variant="outline">Processing</Badge>;
      case 'completed': return <Badge variant="default">Completed</Badge>;
      case 'approved': return <Badge className="bg-green-500">Approved</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return <Badge variant="outline">Pending</Badge>;
    switch (result) {
      case 'passed': return <Badge className="bg-green-500">Passed</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      case 'inconclusive': return <Badge variant="secondary">Inconclusive</Badge>;
      default: return <Badge variant="outline">{result}</Badge>;
    }
  };

  const getRiskBadge = (level: string | null) => {
    if (!level) return null;
    const colors: Record<string, string> = {
      LOW: "bg-green-500",
      MEDIUM: "bg-yellow-500",
      HIGH: "bg-orange-500",
      "VERY HIGH": "bg-red-500",
    };
    return <Badge className={colors[level] || "bg-muted"}>{level}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Report Batches
          </CardTitle>
          <CardDescription>
            View and manage grouped polygraph report batches
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No batches found</p>
              <p className="text-sm">Upload reports as a batch to see them here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Reports</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">
                      {batch.name || `Batch ${format(new Date(batch.created_at), 'dd/MM/yyyy')}`}
                    </TableCell>
                    <TableCell>{format(new Date(batch.examination_date), 'PP')}</TableCell>
                    <TableCell>
                      {batch.stores?.store_name || 'N/A'}
                      {batch.stores?.store_code && (
                        <span className="text-muted-foreground text-xs ml-1">
                          ({batch.stores.store_code})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{batch.total_reports}</TableCell>
                    <TableCell>{getStatusBadge(batch.status)}</TableCell>
                    <TableCell>
                      {batch.invoices?.invoice_number ? (
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          <Receipt className="h-3 w-3" />
                          {batch.invoices.invoice_number}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not linked</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewBatch(batch)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Batch Detail Dialog */}
      <Dialog open={!!selectedBatch} onOpenChange={(open) => !open && setSelectedBatch(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {selectedBatch?.name || 'Batch Details'}
            </DialogTitle>
            <DialogDescription>
              {selectedBatch?.stores?.store_name} • {selectedBatch?.examiners?.name} • {selectedBatch && format(new Date(selectedBatch.examination_date), 'PP')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {selectedBatch && getStatusBadge(selectedBatch.status)}
                <span className="text-sm text-muted-foreground">
                  {selectedBatch?.total_reports} report(s)
                </span>
              </div>
              <div className="flex gap-2">
                {selectedBatch && !selectedBatch.invoice_id && (
                  <Button variant="outline" size="sm" onClick={openLinkInvoiceDialog}>
                    <Link className="h-4 w-4 mr-1" />
                    Link Invoice
                  </Button>
                )}
                {selectedBatch?.invoice_id && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Receipt className="h-3 w-3" />
                    {selectedBatch.invoices?.invoice_number}
                  </Badge>
                )}
                {selectedBatch?.status !== 'approved' && (
                  <Button size="sm" onClick={handleApproveBatch}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Approve Batch
                  </Button>
                )}
              </div>
            </div>

            {loadingReports ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Risk Level</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        {report.first_name} {report.last_name}
                      </TableCell>
                      <TableCell>{report.id_number}</TableCell>
                      <TableCell>{getResultBadge(report.overall_result)}</TableCell>
                      <TableCell>{getRiskBadge(report.risk_level)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewRiskProfile(report)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {report.report_pdf_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <a href={report.report_pdf_url} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Invoice Dialog */}
      <Dialog open={linkInvoiceOpen} onOpenChange={setLinkInvoiceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Invoice to Batch</DialogTitle>
            <DialogDescription>
              Select an invoice to link to this batch of reports
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Invoice</Label>
              <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an invoice" />
                </SelectTrigger>
                <SelectContent>
                  {availableInvoices.map((invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.invoice_number} - {format(new Date(invoice.invoice_date), 'PP')} - R{invoice.total_amount.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkInvoiceOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLinkInvoice} disabled={!selectedInvoiceId || linking}>
              {linking ? "Linking..." : "Link Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Risk Profile Dialog */}
      <RiskProfileDialog
        open={riskProfileOpen}
        onOpenChange={setRiskProfileOpen}
        reportId={selectedReportId || undefined}
        candidateName={selectedCandidateName}
      />
    </>
  );
};

export default BatchListSection;