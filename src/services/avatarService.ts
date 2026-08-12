import { supabase } from '../lib/supabase';

// Create service role client for bypassing RLS during uploads
const supabaseAdmin = supabase;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGE_DIMENSION = 1000; // Max width/height
const TARGET_IMAGE_DIMENSION = 500; // Target size for avatars
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export interface AvatarUploadResult {
  success: boolean;
  avatarUrl?: string;
  error?: string;
}

/**
 * Validate image file
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload PNG, JPG, JPEG, or WEBP images.'
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'Image size must be less than 5 MB.'
    };
  }

  return { valid: true };
}

/**
 * Compress and resize image
 */
export async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // Calculate dimensions (maintain aspect ratio)
      let width = img.width;
      let height = img.height;

      // Resize if larger than max dimension
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;

      // Draw image to canvas
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP with quality 0.8
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/webp',
          0.8
        );
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Upload avatar to Supabase Storage
 */
export async function uploadAvatar(
  file: File,
  userId: string,
  workspaceId: string
): Promise<AvatarUploadResult> {
  try {
    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Compress image
    const compressedBlob = await compressImage(file);
    const compressedFile = new File([compressedBlob], `${userId}.webp`, {
      type: 'image/webp'
    });

    // Upload to Supabase Storage
    const filePath = `${workspaceId}/${userId}.webp`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('profile-images')
      .upload(filePath, compressedFile, {
        upsert: true, // Overwrite existing avatar
        contentType: 'image/webp'
      });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('profile-images')
      .getPublicUrl(filePath);

    const avatarUrl = publicUrlData.publicUrl;

    // Update profile using server-side Edge Function to bypass RLS safely
    try {
      // Attach the user's access token so the Edge Function can verify identity
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = (sessionData as any)?.data?.session?.access_token || null;

      const { data: fnData, error: fnError } = await supabase.functions.invoke("update-avatar", {
        body: { user_id: userId, avatar_url: avatarUrl, workspace_id: workspaceId },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
      });

      if (fnError) {
        console.error('update-avatar function error:', fnError);
        return { success: false, error: fnError.message };
      }

      // If the function returns a payload, ensure success
      if (fnData && (fnData as any).success === false) {
        return { success: false, error: (fnData as any).details || 'Server failed to update profile' };
      }

      return { success: true, avatarUrl };
    } catch (err) {
      console.error('update-avatar invoke error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to update profile via function' };
    }
  } catch (error) {
    console.error('Avatar upload error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to upload avatar' 
    };
  }
}

/**
 * Remove avatar from Supabase Storage and profile
 */
export async function removeAvatar(
  userId: string,
  workspaceId: string
): Promise<AvatarUploadResult> {
  try {
    // Get current avatar URL from profile
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Profile fetch error:', fetchError);
      return { success: false, error: fetchError.message };
    }

    if (!profile?.avatar_url) {
      return { success: true }; // No avatar to remove
    }

    // Delete file from storage
    const filePath = `${workspaceId}/${userId}.webp`;
    const { error: deleteError } = await supabase.storage
      .from('profile-images')
      .remove([filePath]);

    if (deleteError) {
      console.error('Storage delete error:', deleteError);
      // Continue anyway to update profile
    }

    // Update profile to remove avatar URL via Edge Function (bypass RLS)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = (sessionData as any)?.data?.session?.access_token || null;

      const { data: fnData, error: fnError } = await supabase.functions.invoke("update-avatar", {
        body: { user_id: userId, avatar_url: null, workspace_id: workspaceId },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
      });

      if (fnError) {
        console.error('update-avatar function error:', fnError);
        return { success: false, error: fnError.message };
      }

      if (fnData && (fnData as any).success === false) {
        return { success: false, error: (fnData as any).details || 'Server failed to update profile' };
      }

      return { success: true };
    } catch (err) {
      console.error('update-avatar invoke error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to update profile via function' };
    }
  } catch (error) {
    console.error('Avatar removal error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to remove avatar' 
    };
  }
}

/**
 * Get user initials for fallback avatar
 */
export function getUserInitials(fullName?: string | null): string {
  if (!fullName) return '?';
  
  const parts = fullName.trim().split(' ');
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}