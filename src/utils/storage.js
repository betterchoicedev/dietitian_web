const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://dietitian-be.azurewebsites.net/';

/**
 * Upload a file via backend to Google Cloud Storage
 * @param {File} file - The file to upload
 * @param {string} folder - The folder path within the bucket (e.g., 'images', 'videos', 'user_123')
 * @param {string} bucket - The storage bucket name (default: 'users-chat-uploads')
 * @param {Object} extraFields - Additional form fields (e.g., user_code, priority)
 * @returns {Promise<{url: string, path: string, error: null} | {url: null, path: null, error: string}>}
 */
export async function uploadFile(file, folder = 'chat', bucket = 'users-chat-uploads', extraFields = {}) {
  try {
    if (!file || !(file instanceof File)) {
      throw new Error('Invalid file provided');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    if (bucket) {
      formData.append('bucket', bucket);
    }
    Object.entries(extraFields || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });

    console.log('📤 Uploading file to backend endpoint:', {
      originalName: file.name,
      size: file.size,
      type: file.type,
      folder
    });

    const response = await fetch(`${BACKEND_URL}/api/chat/uploads`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody?.error || 'Failed to upload file';
      console.error('❌ Upload error:', message, errorBody);
      throw new Error(message);
    }

    const payload = await response.json();

    console.log('✅ File uploaded successfully:', {
      path: payload.path,
      url: payload.url
    });

    return {
      url: payload.url,
      path: payload.path,
      error: null
    };
  } catch (error) {
    console.error('❌ File upload failed:', error);
    return {
      url: null,
      path: null,
      error: error.message || 'Failed to upload file'
    };
  }
}

/**
 * Delete a file from Google Cloud Storage via backend
 * @param {string} filePath - The path of the file to delete
 * @param {string} bucket - The storage bucket name (default: 'users-chat-uploads')
 * @returns {Promise<{success: boolean, error: null | string}>}
 */
export async function deleteFile(filePath, bucket = 'users-chat-uploads') {
  try {
    if (!filePath) {
      throw new Error('File path is required');
    }

    console.log('🗑️ Deleting file:', filePath);

    const response = await fetch(`${BACKEND_URL}/api/chat/uploads`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        path: filePath,
        bucket
      })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody?.error || 'Failed to delete file';
      console.error('❌ Delete error:', message, errorBody);
      throw new Error(message);
    }

    console.log('✅ File deleted successfully');

    return {
      success: true,
      error: null
    };
  } catch (error) {
    console.error('❌ File deletion failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete file'
    };
  }
}

/**
 * Upload multiple files through the backend endpoint
 * @param {File[]} files - Array of files to upload
 * @param {string} folder - The folder path within the bucket
 * @param {string} bucket - The storage bucket name (default: 'users-chat-uploads')
 * @returns {Promise<Array<{url: string, path: string, error: null}>>}
 */
export async function uploadMultipleFiles(files, folder = 'chat', bucket = 'users-chat-uploads', extraFields = {}) {
  try {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('Invalid files array provided');
    }

    console.log(`📤 Uploading ${files.length} files...`);

    const uploadPromises = files.map(file => uploadFile(file, folder, bucket, extraFields));
    const results = await Promise.all(uploadPromises);

    const successCount = results.filter(r => r.error === null).length;
    console.log(`✅ Uploaded ${successCount}/${files.length} files successfully`);

    return results;
  } catch (error) {
    console.error('❌ Multiple file upload failed:', error);
    return [];
  }
}

/**
 * Get file type category from MIME type
 * @param {string} mimeType - The MIME type of the file
 * @returns {string} - 'image', 'video', 'audio', 'document', or 'other'
 */
export function getFileCategory(mimeType) {
  if (!mimeType) return 'other';
  
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
  
  return 'other';
}

/**
 * Validate file size and type
 * @param {File} file - The file to validate
 * @param {Object} options - Validation options
 * @param {number} options.maxSize - Maximum file size in bytes (default: 50MB)
 * @param {string[]} options.allowedTypes - Allowed MIME types (default: images and videos)
 * @returns {Object} - {valid: boolean, error: string | null}
 */
export function validateFile(file, options = {}) {
  const {
    maxSize = 50 * 1024 * 1024, // 50MB default
    allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/mpeg'
    ]
  } = options;

  // Check if file exists
  if (!file || !(file instanceof File)) {
    return { valid: false, error: 'Invalid file' };
  }

  // Check file size
  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    return { valid: false, error: `File size exceeds ${maxSizeMB}MB limit` };
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `File type ${file.type} is not allowed` };
  }

  return { valid: true, error: null };
}

/**
 * Format file size to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size (e.g., '2.5 MB')
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

