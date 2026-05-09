import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, FileText, X, CheckCircle2, AlertCircle, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Store {
  id: string;
  store_name: string;
  store_code: string;
  account_id: string | null;
}

interface Examiner {
  id: string;
  name: string;
}

interface Account {
  id: string;
  name: string;
}

interface FileUploadState {
  file: File;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
}

interface BatchUploadSectionProps {
  onBatchCreated: () => void;
}

const BatchUploadSection = ({ onBatchCreated }: BatchUploadSectionProps) => {
  const { toast } = useToast();
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [examiners, setExaminers] = useState<Examiner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedExaminerId, setSelectedExaminerId] = useState("");
  const [batchName, setBatchName] = useState("");
  const [newExaminerName, setNewExaminerName] = useState("");
  const [showAddExaminer, setShowAddExaminer] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      fetchStoresByAccount(selectedAccountId);
    } else {
      setStores([]);
    }
    setSelectedStoreId("");
  }, [selectedAccountId]);

  const fetchInitialData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: isMasterAdmin } = await supabase.rpc("is_master_admin", { _user_id: user.id });

    if (isMasterAdmin) {
      const { data: accountsData } = await supabase.from("accounts").select("id, name").order("name");
      setAccounts(accountsData || []);
    } else {
      const { data: accessData } = await supabase
        .from("account_access")
        .select("account_id, accounts(id, name)")
        .eq("user_id", user.id);

      const accessibleAccounts = (accessData?.map((a) => a.accounts).filter(Boolean) as Account[]) || [];
      setAccounts(accessibleAccounts);
    }

    const { data: examinersData } = await supabase
      .from("examiners")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setExaminers(examinersData || []);
  };

  const fetchStoresByAccount = async (accountId: string) => {
    const { data: storesData } = await supabase
      .from("stores")
      .select("id, store_name, store_code, account_id")
      .eq("account_id", accountId)
      .order("store_name");
    setStores(storesData || []);
  };

  const handleAddExaminer = async () => {
    if (!newExaminerName.trim()) return;

    try {
      const { data, error } = await supabase
        .from("examiners")
        .insert({ name: newExaminerName.trim(), is_active: true })
        .select("id, name")
        .single();

      if (error) throw error;

      setExaminers((prev) => [...prev, data]);
      setSelectedExaminerId(data.id);
      setNewExaminerName("");
      setShowAddExaminer(false);

      toast({ title: "Examiner Added", description: `${data.name} has been added.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to add examiner", variant: "destructive" });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const normalizeName = (name: string) => name.trim().toLowerCase();

    const oldDocFiles = selectedFiles.filter((file) => {
      const fileName = normalizeName(file.name);
      return /\.doc$/i.test(fileName) && !/\.docx$/i.test(fileName);
    });

    if (oldDocFiles.length > 0) {
      toast({
        title: "Unsupported Format",
        description: "The older .doc format is not supported. Please save documents as .docx or PDF.",
        variant: "destructive",
      });
    }

    const validFiles = selectedFiles.filter((file) => {
      const fileName = normalizeName(file.name);
      const mime = (file.type || "").toLowerCase();
      const isAllowedMime =
        mime === "application/pdf" ||
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      return /\.(pdf|docx)$/i.test(fileName) || isAllowedMime;
    });

    if (validFiles.length !== selectedFiles.length && oldDocFiles.length === 0) {
      toast({
        title: "Invalid Files",
        description: "Only PDF and Word documents (.pdf, .docx) are accepted. Some files were skipped.",
        variant: "destructive",
      });
    }

    if (validFiles.length === 0) return;

    const newFiles: FileUploadState[] = validFiles.map((file) => ({ file, status: "pending" }));
    setFiles((prev) => [...prev, ...newFiles]);

    if (!batchName && validFiles.length > 0) {
      const date = new Date().toLocaleDateString("en-GB");
      setBatchName(`Batch - ${date} (${files.length + validFiles.length} reports)`);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFileToStorage = async (file: File): Promise<string | null> => {
    const uploadId = crypto.randomUUID();
    const fileName = `pending/${uploadId}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("polygraph-reports")
      .upload(fileName, file, { contentType: file.type });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }
    // Bucket is private; store the storage path-style URL using public-style URL
    // for compatibility with existing readers (signed URLs are generated on view).
    const { data: { publicUrl } } = supabase.storage.from("polygraph-reports").getPublicUrl(fileName);
    return publicUrl;
  };

  const handleSubmitBatch = async () => {
    if (files.length === 0) return;

    if (!selectedAccountId || !selectedStoreId || !selectedExaminerId) {
      toast({
        title: "Missing Information",
        description: "Please select account, store, and examiner.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      let successCount = 0;
      const updated = [...files];

      for (let i = 0; i < updated.length; i++) {
        if (updated[i].status === "completed") {
          successCount++;
          continue;
        }
        updated[i] = { ...updated[i], status: "uploading", error: undefined };
        setFiles([...updated]);

        const fileUrl = await uploadFileToStorage(updated[i].file);
        if (!fileUrl) {
          updated[i] = { ...updated[i], status: "error", error: "Upload failed" };
          setFiles([...updated]);
          continue;
        }

        const pendingPayload = {
          account_id: selectedAccountId,
          store_id: selectedStoreId,
          examiner_id: selectedExaminerId,
          original_file_url: fileUrl,
          original_file_name: updated[i].file.name,
          extracted_data: null,
          status: "pending",
          uploaded_by: user?.id,
        };

        const { error: pendingError } = await supabase
          .from("pending_polygraph_uploads")
          .insert([pendingPayload]);

        if (pendingError) {
          console.error("Error saving pending upload:", pendingError);
          updated[i] = { ...updated[i], status: "error", error: pendingError.message };
        } else {
          updated[i] = { ...updated[i], status: "completed" };
          successCount++;
        }
        setFiles([...updated]);
      }

      toast({
        title: "Batch Submitted for Review",
        description: `${successCount} of ${updated.length} report(s) uploaded. Master Admin will extract and approve.`,
      });

      if (successCount === updated.length) {
        setFiles([]);
        setBatchName("");
        setSelectedAccountId("");
        setSelectedStoreId("");
        setSelectedExaminerId("");
      }
      onBatchCreated();
    } catch (error: any) {
      console.error("Error saving batch:", error);
      toast({ title: "Error", description: error.message || "Failed to save batch", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const completedCount = files.filter((f) => f.status === "completed").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const uploadingCount = files.filter((f) => f.status === "uploading").length;
  const pendingCount = files.filter((f) => f.status === "pending").length;
  const progress = files.length > 0 ? ((completedCount + errorCount) / files.length) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Upload Reports</CardTitle>
        <CardDescription>
          Upload multiple polygraph reports as raw files. Master Admin will run extraction and approve them in the
          Pending Review queue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Selection */}
        <div className="text-center p-8 border-2 border-dashed rounded-lg">
          <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <input
            type="file"
            accept=".pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            id="batch-upload"
            disabled={isSaving}
          />
          <label htmlFor="batch-upload">
            <Button variant="outline" asChild className="cursor-pointer">
              <span>Select Files (PDF or Word)</span>
            </Button>
          </label>
          <p className="text-sm text-muted-foreground mt-2">
            Files are uploaded as-is. Data extraction happens during Master Admin review.
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Selected Files ({files.length})</h4>
              {isSaving && <Progress value={progress} className="w-48" />}
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.map((fileState, index) => (
                <div key={index} className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{fileState.file.name}</p>
                        {fileState.error && <p className="text-xs text-destructive">{fileState.error}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {fileState.status === "pending" && <Badge variant="outline">Pending</Badge>}
                      {fileState.status === "uploading" && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Uploading
                        </Badge>
                      )}
                      {fileState.status === "completed" && (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Submitted
                        </Badge>
                      )}
                      {fileState.status === "error" && (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Error
                        </Badge>
                      )}
                      {!isSaving && (
                        <Button variant="ghost" size="icon" onClick={() => removeFile(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4 text-sm">
              {pendingCount > 0 && <span className="text-muted-foreground">{pendingCount} pending</span>}
              {uploadingCount > 0 && <span className="text-primary">{uploadingCount} uploading</span>}
              {completedCount > 0 && <span className="text-green-600">{completedCount} submitted</span>}
              {errorCount > 0 && <span className="text-destructive">{errorCount} failed</span>}
            </div>
          </div>
        )}

        {/* Batch Configuration */}
        {files.length > 0 && (
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium">Batch Configuration</h4>

            <div className="space-y-2">
              <Label>Batch Name</Label>
              <Input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="Enter batch name"
                disabled={isSaving}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account *</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={isSaving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sub-Account / Store *</Label>
                <Select
                  value={selectedStoreId}
                  onValueChange={setSelectedStoreId}
                  disabled={!selectedAccountId || isSaving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedAccountId ? "Select store" : "Select account first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.store_name} ({store.store_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Examiner *</Label>
              {!showAddExaminer ? (
                <div className="flex gap-2">
                  <Select value={selectedExaminerId} onValueChange={setSelectedExaminerId} disabled={isSaving}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select examiner" />
                    </SelectTrigger>
                    <SelectContent>
                      {examiners.map((examiner) => (
                        <SelectItem key={examiner.id} value={examiner.id}>
                          {examiner.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowAddExaminer(true)}
                    disabled={isSaving}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter examiner name"
                    value={newExaminerName}
                    onChange={(e) => setNewExaminerName(e.target.value)}
                  />
                  <Button type="button" onClick={handleAddExaminer}>
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowAddExaminer(false);
                      setNewExaminerName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmitBatch}
              disabled={isSaving || !selectedAccountId || !selectedStoreId || !selectedExaminerId}
              className="w-full"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting for Review...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Submit All for Master Review ({files.length})
                </>
              )}
            </Button>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-medium mb-2">Instructions:</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Select the PDF or Word reports for this batch</li>
            <li>Choose account, store and examiner</li>
            <li>Submit — files upload as-is (no AI extraction at this stage)</li>
            <li>Master Admin opens each report in Pending Review, clicks "Extract Data with AI", reviews, and approves</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

export default BatchUploadSection;
