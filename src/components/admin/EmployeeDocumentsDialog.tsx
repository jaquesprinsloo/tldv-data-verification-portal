import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Trash2, Download, Loader2, Eye, X } from "lucide-react";
import { format } from "date-fns";

interface EmployeeDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
}

interface EmployeeDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  description: string | null;
  uploaded_at: string;
}

const documentTypes = [
  { value: 'contract', label: 'Employee Contract' },
  { value: 'training', label: 'Training Confirmation' },
  { value: 'warning', label: 'Warning' },
  { value: 'certificate', label: 'Certificate' },
];

export function EmployeeDocumentsDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
}: EmployeeDocumentsDialogProps) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("contract");
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
  
  // Upload form state
  const [documentType, setDocumentType] = useState<string>("contract");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open && employeeId) {
      fetchDocuments();
    }
  }, [open, employeeId]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employee_documents')
        .select('*')
        .eq('employee_id', employeeId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${employeeId}/${documentType}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('employee-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('employee-documents')
        .getPublicUrl(fileName);

      // Save document record
      const { error: insertError } = await supabase
        .from('employee_documents')
        .insert({
          employee_id: employeeId,
          document_type: documentType,
          file_name: file.name,
          file_url: publicUrl,
          description: description || null,
        });

      if (insertError) throw insertError;

      toast({
        title: "Document Uploaded",
        description: "The document has been uploaded successfully.",
      });

      // Reset form
      setFile(null);
      setDescription("");
      fetchDocuments();
    } catch (error: any) {
      console.error('Error uploading document:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload document.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string, fileName: string) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('employee-documents')
        .remove([`${employeeId}/${fileName}`]);

      if (storageError) {
        console.error('Storage delete error:', storageError);
      }

      // Delete record
      const { error } = await supabase
        .from('employee_documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      toast({
        title: "Document Deleted",
        description: "The document has been removed.",
      });

      fetchDocuments();
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete document.",
        variant: "destructive",
      });
    }
  };

  const filteredDocuments = documents.filter(doc => doc.document_type === activeTab);

  const getDocumentTypeLabel = (type: string) => {
    return documentTypes.find(t => t.value === type)?.label || type;
  };

  const getDocumentTypeBadge = (type: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      contract: "default",
      training: "secondary",
      warning: "destructive",
      certificate: "outline",
    };
    return <Badge variant={variants[type] || "default"}>{getDocumentTypeLabel(type)}</Badge>;
  };

  const isPreviewable = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  const getPreviewContent = (doc: EmployeeDocument) => {
    const ext = doc.file_name.split('.').pop()?.toLowerCase();
    
    if (ext === 'pdf') {
      return (
        <iframe
          src={doc.file_url}
          className="w-full h-full rounded-lg"
          title={doc.file_name}
        />
      );
    }
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return (
        <img
          src={doc.file_url}
          alt={doc.file_name}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      );
    }
    
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="h-16 w-16 mb-4" />
        <p>Preview not available for this file type</p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => window.open(doc.file_url, '_blank')}
        >
          <Download className="h-4 w-4 mr-2" />
          Download to view
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Additional Documents - {employeeName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="contract">Contracts</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
            <TabsTrigger value="warning">Warnings</TabsTrigger>
            <TabsTrigger value="certificate">Certificates</TabsTrigger>
          </TabsList>

          {documentTypes.map(type => (
            <TabsContent key={type.value} value={type.value} className="space-y-4">
              {/* Upload Form */}
              <form onSubmit={handleUpload} className="border rounded-lg p-4 space-y-4 bg-muted/50">
                <h4 className="font-medium">Upload New {type.label}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`file-${type.value}`}>Select File</Label>
                    <Input
                      id={`file-${type.value}`}
                      type="file"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] || null);
                        setDocumentType(type.value);
                      }}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`desc-${type.value}`}>Description (Optional)</Label>
                    <Textarea
                      id={`desc-${type.value}`}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={`Add a description for this ${type.label.toLowerCase()}...`}
                      rows={2}
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  disabled={uploading || !file || documentType !== type.value}
                  className="w-full md:w-auto"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload {type.label}
                    </>
                  )}
                </Button>
              </form>

              {/* Documents Table */}
              <div className="border rounded-lg">
                {loading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Loading documents...</p>
                  </div>
                ) : filteredDocuments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocuments.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">{doc.file_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {doc.description || '-'}
                          </TableCell>
                          <TableCell>
                            {format(new Date(doc.uploaded_at), 'PPp')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {isPreviewable(doc.file_name) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setPreviewDoc(doc)}
                                  title="Preview"
                                >
                                  <Eye className="h-4 w-4 text-blue-600" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(doc.file_url, '_blank')}
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(doc.id, doc.file_name)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No {type.label.toLowerCase()}s uploaded yet</p>
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* Preview Modal */}
        {previewDoc && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="relative w-full max-w-5xl h-[80vh] bg-background rounded-lg shadow-lg flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5" />
                  <div>
                    <h3 className="font-medium">{previewDoc.file_name}</h3>
                    {previewDoc.description && (
                      <p className="text-sm text-muted-foreground">{previewDoc.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(previewDoc.file_url, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPreviewDoc(null)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 p-4 overflow-auto flex items-center justify-center">
                {getPreviewContent(previewDoc)}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
