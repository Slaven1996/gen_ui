import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AuthResponse, ChangePasswordDto, PublicUser, UpdateProfileDto } from '@gen-ui/shared';
import { http } from '@/lib/api/http';
import { broadcastSession } from '@/lib/auth/auth-channel';
import { authStore } from '@/lib/auth/auth-store';

export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (dto: UpdateProfileDto) => {
      const { data } = await http.patch<PublicUser>('/profile', dto);
      return data;
    },
    onSuccess: (user) => {
      // The sidebar and header read the user straight from the auth store.
      authStore.setUser(user);
      toast.success('Profile updated');
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (dto: ChangePasswordDto) => {
      // Never retried on 401: a wrong current password is a real answer here,
      // not an expired access token.
      const { data } = await http.post<AuthResponse>('/profile/password', dto, {
        skipAuthRefresh: true,
      });
      return data;
    },
    onSuccess: (session) => {
      // The server revoked every refresh token and issued this tab a new pair.
      // Adopt it, and hand it to the other tabs so they aren't signed out.
      const expiresAt = Date.now() + session.expiresIn * 1000;
      authStore.applySession(session, expiresAt);
      broadcastSession(session, expiresAt);
      toast.success('Password changed. Other devices have been signed out.');
    },
  });
}
