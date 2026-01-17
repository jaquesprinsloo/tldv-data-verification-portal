/**
 * Storage utility functions for managing file cleanup
 */

/**
 * Extract the storage file path from a full URL
 * @param fileUrl - The full URL of the file in storage
 * @param bucketName - The name of the storage bucket
 * @returns The file path within the bucket, or null if extraction fails
 */
export const extractStoragePath = (fileUrl: string, bucketName: string): string | null => {
  if (!fileUrl) return null;
  
  try {
    // Handle full URLs with bucket name in path
    if (fileUrl.includes(`/${bucketName}/`)) {
      const parts = fileUrl.split(`/${bucketName}/`);
      return decodeURIComponent(parts[parts.length - 1]);
    }
    // If it's already just a path, return as-is
    return fileUrl;
  } catch {
    console.error("Failed to extract storage path from:", fileUrl);
    return null;
  }
};

/**
 * Delete a file from storage if it exists
 * @param supabase - Supabase client instance
 * @param bucketName - The storage bucket name
 * @param fileUrl - The URL of the file to delete
 * @returns Promise<boolean> - true if deleted successfully or file didn't exist
 */
export const deleteStorageFile = async (
  supabase: any,
  bucketName: string,
  fileUrl: string | null | undefined
): Promise<boolean> => {
  if (!fileUrl) return true;
  
  try {
    const path = extractStoragePath(fileUrl, bucketName);
    if (!path) return true;
    
    const { error } = await supabase.storage.from(bucketName).remove([path]);
    if (error) {
      console.error(`Failed to delete file from ${bucketName}:`, error);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Error deleting file from ${bucketName}:`, error);
    return false;
  }
};
