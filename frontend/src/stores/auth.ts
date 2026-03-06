import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type User = {
  id: number;
  email: string;
  name: string;
  role: string;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setAuth: (accessToken: string, user: User, refreshToken?: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: (accessToken, user, refreshToken) =>
        set({
          accessToken,
          user,
          refreshToken: refreshToken !== undefined ? refreshToken : get().refreshToken,
        }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'botwave-auth' }
  )
);

export function getToken(): string | null {
  return useAuthStore.getState().accessToken;
}

export function getRefreshToken(): string | null {
  return useAuthStore.getState().refreshToken;
}
