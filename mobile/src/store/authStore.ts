import { Platform } from 'react-native';
import { create } from 'zustand';
import { api } from '../services/api';

interface User {
  id: number;
  email: string | null;
  name: string | null;
  provider?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  login: (provider: 'apple' | 'google', token: string, fullName?: { givenName?: string; familyName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (provider, token, fullName) => {
    set({ loading: true });
    try {
      const user = provider === 'apple'
        ? await api.loginWithApple(token, fullName)
        : await api.loginWithGoogle(token);
      set({ user, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: async () => {
    await api.logout();
    set({ user: null });
  },

  checkAuth: async () => {
    try {
      const hasToken = await api.hasToken();
      if (!hasToken) {
        // Web (the /m pseudo-app) has no Apple/Google sign-in; the data routes
        // are open, so enter as a local guest instead of dead-ending at login.
        if (Platform.OS === 'web') {
          set({ user: { id: 0, email: null, name: 'Guest', provider: 'web' }, initialized: true });
          return;
        }
        set({ initialized: true });
        return;
      }
      const user = await api.getMe();
      set({ user, initialized: true });
    } catch {
      await api.logout();
      set({ user: null, initialized: true });
    }
  },
}));
