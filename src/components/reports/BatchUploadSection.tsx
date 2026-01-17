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
  status: 'pending' | 'processing' | 'completed' | 'error';
  extractedData?: any;
  error?: string;
  reportId?: string;
  progress?: number;
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
  
  const [isProcessing, setIsProcessing] = useState(false);
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

    const { data: isMasterAdmin } = await supabase.rpc('is_master_admin', { _user_id: user.id });

    if (isMasterAdmin) {
      const { data: accountsData } = await supabase.from("accounts").select("id, name").order("name");
      setAccounts(accountsData || []);
    } else {
      const { data: accessData } = await supabase
        .from("account_access")
        .select("account_id, accounts(id, name)")
        .eq("user_id", user.id);
      
      const accessibleAccounts = accessData?.map(a => a.accounts).filter(Boolean) as Account[] || [];
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

      setExaminers(prev => [...prev, data]);
      setSelectedExaminerId(data.id);
      setNewExaminerName("");
      setShowAddExaminer(false);
      
      toast({
        title: "Examiner Added",
        description: `${data.name} has been added to the examiners list.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add examiner",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    console.info('[polygraph-batch] selected files', selectedFiles.map(f => ({ name: f.name, type: f.type, size: f.size })));

    // Normalize names to avoid issues with trailing spaces (common on Windows)
    const normalizeName = (name: string) => name.trim().toLowerCase();

    // Check for unsupported .doc files (older binary format)
    const oldDocFiles = selectedFiles.filter(file => {
      const fileName = normalizeName(file.name);
      return /\.doc$/i.test(fileName) && !/\.docx$/i.test(fileName);
    });

    if (oldDocFiles.length > 0) {
      toast({
        title: "Unsupported Format",
        description: "The older .doc format is not supported. Please save documents as .docx (Word 2007+) or PDF.",
        variant: "destructive",
      });
    }

    const validFiles = selectedFiles.filter(file => {
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

    const newFiles: FileUploadState[] = validFiles.map(file => ({
      file,
      status: 'pending',
    }));

    setFiles(prev => [...prev, ...newFiles]);
    
    // Auto-generate batch name if empty
    if (!batchName && validFiles.length > 0) {
      const date = new Date().toLocaleDateString('en-GB');
      setBatchName(`Batch - ${date} (${files.length + validFiles.length} reports)`);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const processFile = async (
    fileState: FileUploadState, 
    index: number,
    updateProgress: (index: number, progress: number) => void
  ): Promise<FileUploadState> => {
    try {
      updateProgress(index, 10);
      const fileBase64 = await fileToBase64(fileState.file);
      updateProgress(index, 20);
      
      // Detect file type
      const fileName = fileState.file.name.toLowerCase();
      const isWordDoc = fileName.endsWith('.docx') || fileName.endsWith('.doc');
      
      // Simulate progress during API call
      let currentProgress = 20;
      const progressInterval = setInterval(() => {
        currentProgress = Math.min(currentProgress + 2, 90);
        updateProgress(index, currentProgress);
      }, 500);

      // Send as docxBase64 for Word docs, pdfBase64 for PDFs
      const requestBody = isWordDoc 
        ? { docxBase64: fileBase64, fileName: fileState.file.name }
        : { pdfBase64: fileBase64, fileName: fileState.file.name };

      const { data, error } = await supabase.functions.invoke('extract-polygraph-report', {
        body: requestBody
      });

      clearInterval(progressInterval);

      if (error) throw new Error(error.message || 'Failed to process document');
      if (data?.error) throw new Error(data.error);

      if (data?.success && data?.data) {
        updateProgress(index, 100);
        return {
          ...fileState,
          status: 'completed',
          extractedData: data.data,
          progress: 100,
        };
      } else {
        throw new Error('No data extracted from document');
      }
    } catch (error) {
      return {
        ...fileState,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to extract data',
        progress: 0,
      };
    }
  };

  const handleProcessAll = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    
    toast({
      title: "Processing Reports",
      description: `Processing ${files.length} report(s). This may take a moment per file...`,
    });

    const updateProgress = (index: number, progress: number) => {
      setFiles(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = { ...updated[index], progress };
        }
        return updated;
      });
    };

    // Process files sequentially to avoid overwhelming the API
    const updatedFiles = [...files];
    for (let i = 0; i < updatedFiles.length; i++) {
      if (updatedFiles[i].status === 'pending') {
        updatedFiles[i] = { ...updatedFiles[i], status: 'processing', progress: 0 };
        setFiles([...updatedFiles]);
        
        const result = await processFile(updatedFiles[i], i, updateProgress);
        updatedFiles[i] = result;
        setFiles([...updatedFiles]);
      }
    }

    const successCount = updatedFiles.filter(f => f.status === 'completed').length;
    const errorCount = updatedFiles.filter(f => f.status === 'error').length;

    toast({
      title: "Processing Complete",
      description: `${successCount} successful, ${errorCount} failed.`,
    });

    setIsProcessing(false);
  };

  const parseExaminationDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return new Date().toISOString().split("T")[0];
    
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
    
    const months: Record<string, number> = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11
    };
    const parts = dateStr.toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (parts) {
      const day = parseInt(parts[1]);
      const month = months[parts[2]];
      const year = parseInt(parts[3]);
      if (month !== undefined) {
        return new Date(year, month, day).toISOString().split("T")[0];
      }
    }
    
    return new Date().toISOString().split("T")[0];
  };

  const mapOverallResult = (examQuestions: any[] | null | undefined): 'passed' | 'failed' | 'inconclusive' | null => {
    if (!examQuestions || examQuestions.length === 0) return null;
    
    const findings = examQuestions.map(q => q.finding?.toUpperCase() || q.result?.toUpperCase() || '');
    
    if (findings.some(f => f === 'SR')) return 'failed';
    if (findings.some(f => f === 'INC')) return 'inconclusive';
    if (findings.length > 0 && findings.every(f => f === 'NSR')) return 'passed';
    
    return 'inconclusive';
  };

  const handleSaveBatch = async () => {
    const completedFiles = files.filter(f => f.status === 'completed');
    if (completedFiles.length === 0) {
      toast({
        title: "No Processed Reports",
        description: "Please process at least one report before saving.",
        variant: "destructive",
      });
      return;
    }

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

      // Create the batch
      const { data: batch, error: batchError } = await supabase
        .from("polygraph_batches")
        .insert({
          name: batchName || `Batch - ${new Date().toLocaleDateString()}`,
          store_id: selectedStoreId,
          examiner_id: selectedExaminerId,
          total_reports: completedFiles.length,
          processed_reports: completedFiles.length,
          status: 'completed',
          created_by: user?.id,
        })
        .select("id")
        .single();

      if (batchError) throw batchError;

      // Save each report
      for (const fileState of completedFiles) {
        const extractedData = fileState.extractedData;

        // Upload document
        let pdfUrl: string | null = null;
        const reportId = crypto.randomUUID();
        const fileName = `${reportId}/${fileState.file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from("polygraph-reports")
          .upload(fileName, fileState.file, { contentType: fileState.file.type });
        
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from("polygraph-reports")
            .getPublicUrl(fileName);
          pdfUrl = publicUrl;
        }

        const reportPayload: Record<string, any> = {
          batch_id: batch.id,
          store_id: selectedStoreId,
          examiner_id: selectedExaminerId,
          examination_date: parseExaminationDate(extractedData.examination?.date),
          first_name: extractedData.candidate?.firstName || "",
          last_name: extractedData.candidate?.lastName || "",
          id_number: extractedData.candidate?.idNumber || "",
          contact_number: extractedData.candidate?.contactNumber || null,
          email: extractedData.candidate?.email || null,
          physical_address: extractedData.candidate?.physicalAddress || null,
          position_applying_for: extractedData.candidate?.positionApplyingFor || null,
          overall_result: mapOverallResult(extractedData.examQuestions),
          examiner_notes: extractedData.result?.examinerNotes || null,
          status: "completed",
          report_pdf_url: pdfUrl,
          candidate_photo_url: extractedData.candidatePhotoUrl || null,
          uploaded_by: user?.id || null,
        };

        // Add risk analysis data
        if (extractedData.riskAnalysis) {
          reportPayload.risk_score = extractedData.riskAnalysis.TotalRiskScore || null;
          let mappedLevel = (extractedData.riskAnalysis.RiskLevel || '').toUpperCase().replace(' RISK', '');
          if (mappedLevel === 'UNACCEPTABLE') mappedLevel = 'VERY HIGH';
          reportPayload.risk_level = ['LOW', 'MEDIUM', 'HIGH', 'VERY HIGH'].includes(mappedLevel) ? mappedLevel : null;
          reportPayload.risk_analysis = extractedData.riskAnalysis;
        }
        if (extractedData.disclosure) reportPayload.extracted_disclosure = extractedData.disclosure;
        if (extractedData.educationHistory) reportPayload.education_history = extractedData.educationHistory;
        if (extractedData.employmentHistory) reportPayload.employment_history = extractedData.employmentHistory;
        if (extractedData.familyCriminalHistory) reportPayload.family_criminal_history = extractedData.familyCriminalHistory;
        if (extractedData.friendCriminalHistory) reportPayload.friend_criminal_history = extractedData.friendCriminalHistory;
        if (extractedData.financialCircumstances) reportPayload.financial_circumstances = extractedData.financialCircumstances;
        if (extractedData.permitsLicensing) reportPayload.permits_licensing = extractedData.permitsLicensing;
        if (extractedData.personalLawEncounters) reportPayload.personal_law_encounters = extractedData.personalLawEncounters;
        if (extractedData.postExamAdmissions) reportPayload.post_exam_admissions = extractedData.postExamAdmissions;

        const { data: reportData, error: reportError } = await supabase
          .from("polygraph_reports")
          .insert(reportPayload as any)
          .select("id")
          .single();

        if (reportError) {
          console.error("Error saving report:", reportError);
          continue;
        }

        // Create employee and candidate
        const candidateIdNumber = extractedData.candidate?.idNumber || "";
        let employeeId: string | null = null;

        if (candidateIdNumber) {
          const { data: existingEmployee } = await supabase
            .from("employees")
            .select("id")
            .eq("id_number", candidateIdNumber)
            .maybeSingle();

          if (existingEmployee) {
            employeeId = existingEmployee.id;
          } else {
            const employeeNumber = `PG${Date.now().toString().slice(-6)}`;
            const { data: newEmployee } = await supabase
              .from("employees")
              .insert({
                employee_number: employeeNumber,
                id_number: candidateIdNumber,
                email: extractedData.candidate?.email || null,
                store_id: selectedStoreId || null,
                employment_status: "active",
              })
              .select("id")
              .single();

            if (newEmployee) employeeId = newEmployee.id;
          }
        }

        // Create candidate profile
        await supabase.from("polygraph_candidates").insert([{
          report_id: reportData.id,
          first_name: extractedData.candidate?.firstName || "",
          last_name: extractedData.candidate?.lastName || "",
          id_number: candidateIdNumber,
          email: extractedData.candidate?.email || null,
          contact_number: extractedData.candidate?.contactNumber || null,
          physical_address: extractedData.candidate?.physicalAddress || null,
          position: extractedData.candidate?.positionApplyingFor || null,
          store_id: selectedStoreId || null,
          status: "pending_review" as const,
          employee_id: employeeId,
        }]);
      }

      toast({
        title: "Batch Saved Successfully",
        description: `${completedFiles.length} report(s) saved and linked to the batch.`,
      });

      // Reset state
      setFiles([]);
      setBatchName("");
      setSelectedAccountId("");
      setSelectedStoreId("");
      setSelectedExaminerId("");
      onBatchCreated();
    } catch (error: any) {
      console.error("Error saving batch:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save batch",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const processingCount = files.filter(f => f.status === 'processing').length;
  const pendingCount = files.filter(f => f.status === 'pending').length;
  const progress = files.length > 0 ? ((completedCount + errorCount) / files.length) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Upload Reports</CardTitle>
        <CardDescription>
          Upload multiple polygraph reports at once. Each report will be processed individually but grouped as a batch.
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
            disabled={isProcessing || isSaving}
          />
          <label htmlFor="batch-upload">
            <Button variant="outline" asChild className="cursor-pointer">
              <span>Select Files (PDF or Word)</span>
            </Button>
          </label>
          <p className="text-sm text-muted-foreground mt-2">
            Select multiple PDF or Word documents to upload as a batch
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Selected Files ({files.length})</h4>
              {isProcessing && <Progress value={progress} className="w-48" />}
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.map((fileState, index) => (
                <div
                  key={index}
                  className="p-3 bg-muted/50 rounded-lg space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {fileState.file.name}
                        </p>
                        {fileState.extractedData?.candidate && (
                          <p className="text-xs text-muted-foreground">
                            {fileState.extractedData.candidate.firstName} {fileState.extractedData.candidate.lastName}
                          </p>
                        )}
                        {fileState.error && (
                          <p className="text-xs text-destructive">{fileState.error}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {fileState.status === 'pending' && (
                        <Badge variant="outline">Pending</Badge>
                      )}
                      {fileState.status === 'processing' && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {fileState.progress ? `${Math.round(fileState.progress)}%` : 'Processing'}
                        </Badge>
                      )}
                      {fileState.status === 'completed' && (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Done
                        </Badge>
                      )}
                      {fileState.status === 'error' && (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Error
                        </Badge>
                      )}
                      {!isProcessing && !isSaving && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Per-file progress bar */}
                  {fileState.status === 'processing' && (
                    <div className="space-y-1">
                      <Progress value={fileState.progress || 0} className="h-2" />
                      <p className="text-xs text-muted-foreground text-center">
                        AI extracting data... {Math.round(fileState.progress || 0)}%
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="flex gap-4 text-sm">
              {pendingCount > 0 && <span className="text-muted-foreground">{pendingCount} pending</span>}
              {processingCount > 0 && <span className="text-primary">{processingCount} processing</span>}
              {completedCount > 0 && <span className="text-green-600">{completedCount} completed</span>}
              {errorCount > 0 && <span className="text-destructive">{errorCount} failed</span>}
            </div>

            {/* Process Button */}
            {pendingCount > 0 && !isProcessing && (
              <Button onClick={handleProcessAll} className="w-full">
                <Loader2 className="mr-2 h-4 w-4" />
                Process All Reports ({pendingCount})
              </Button>
            )}
          </div>
        )}

        {/* Batch Configuration - Show after processing */}
        {completedCount > 0 && !isProcessing && (
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium">Batch Configuration</h4>
            
            <div className="space-y-2">
              <Label>Batch Name</Label>
              <Input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="Enter batch name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account *</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
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
                  disabled={!selectedAccountId}
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
                  <Select value={selectedExaminerId} onValueChange={setSelectedExaminerId}>
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
                  <Button type="button" onClick={handleAddExaminer}>Add</Button>
                  <Button type="button" variant="outline" onClick={() => {
                    setShowAddExaminer(false);
                    setNewExaminerName("");
                  }}>Cancel</Button>
                </div>
              )}
            </div>

            <Button 
              onClick={handleSaveBatch} 
              disabled={isSaving || !selectedAccountId || !selectedStoreId || !selectedExaminerId}
              className="w-full"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving Batch...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Save Batch ({completedCount} reports)
                </>
              )}
            </Button>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-medium mb-2">Instructions:</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Select multiple PDF report files to upload</li>
            <li>Click "Process All Reports" to extract data from each report</li>
            <li>Review the results - each report is processed individually</li>
            <li>Select the account, store, and examiner for the batch</li>
            <li>Save the batch - all reports will be grouped together</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

export default BatchUploadSection;