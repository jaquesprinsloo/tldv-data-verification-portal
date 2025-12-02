import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, ClipboardCheck, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DocumentUploadTabProps {
  accountId: string;
  onUploadComplete: () => void;
}

type DocumentType = "invoice" | "polygraph_report" | "risk_assessment";

export const DocumentUploadTab = ({ accountId, onUploadComplete }: DocumentUploadTabProps) => {
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType>("invoice");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Please select a PDF file");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file to upload");
      return;
    }

    setUploading(true);
    try {
      // Upload file to storage
      const fileName = `${accountId}/${selectedType}/${Date.now()}_${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("pending-documents")
        .upload(fileName, selectedFile);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("pending-documents")
        .getPublicUrl(fileName);

      // Process with AI
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("process-pending-upload", {
        body: {
          fileUrl: urlData.publicUrl,
          accountId,
          documentType: selectedType,
          fileName: selectedFile.name,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to process upload");
      }

      toast.success(response.data?.message || "Document uploaded and queued for review");
      setSelectedFile(null);
      onUploadComplete();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const documentTypes = [
    { value: "invoice", label: "Invoice", icon: FileText, description: "Upload invoices for expense tracking" },
    { value: "polygraph_report", label: "Polygraph Report", icon: ClipboardCheck, description: "Upload polygraph examination reports" },
    { value: "risk_assessment", label: "Risk Assessment", icon: ShieldCheck, description: "Upload risk assessment reports" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </CardTitle>
          <CardDescription>
            Upload documents and they will be automatically matched to sub-accounts using AI recognition.
            Documents require master admin approval before being assigned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Document Type Selection */}
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={selectedType} onValueChange={(v) => setSelectedType(v as DocumentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <type.icon className="h-4 w-4" />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {documentTypes.find(t => t.value === selectedType)?.description}
            </p>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Select PDF File</Label>
            <Input
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Upload Button */}
          <Button 
            onClick={handleUpload} 
            disabled={!selectedFile || uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload & Process
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {documentTypes.map((type) => (
          <Card key={type.value} className={selectedType === type.value ? "ring-2 ring-primary" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <type.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
