import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User, UserRole, RegisterRequest } from "../../types/backend";
import {
  loginUser,
  registerUser,
  getCurrentUser,
  setAuthToken,
  seedDemoAccounts,
} from "../../services/api";

interface AuthContextType {
  user: User | null;
  role: UserRole;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: RegisterRequest) => Promise<User>;
  logout: () => void;
  loginAsDemo: (role: "patient" | "caregiver") => Promise<User>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Session storage key for access token
const TOKEN_STORAGE_KEY = "carebridge_session_token";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const savedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
        if (savedToken) {
          setAuthToken(savedToken);
          setTokenState(savedToken);
          const currentUser = await getCurrentUser();
          setUser(currentUser);
        }
      } catch {
        // Token invalid or expired
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        setAuthToken(null);
        setTokenState(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await loginUser({ email, password });
      setTokenState(response.access_token);
      setAuthToken(response.access_token);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
      setUser(response.user);
      return response.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (payload: RegisterRequest): Promise<User> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await registerUser(payload);
      setTokenState(response.access_token);
      setAuthToken(response.access_token);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
      setUser(response.user);
      return response.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setTokenState(null);
    setAuthToken(null);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setError(null);
  }, []);

  const loginAsDemo = useCallback(
    async (targetRole: "patient" | "caregiver"): Promise<User> => {
      setIsLoading(true);
      setError(null);
      try {
        // Attempt seeding demo accounts on backend if not existing
        try {
          await seedDemoAccounts();
        } catch {
          // Backend may already have them seeded
        }

        const email =
          targetRole === "patient"
            ? "kaviya.sundaram@example.com"
            : "anitha.nathan@example.com";
        const password = "DemoPassword123!";

        return await login(email, password);
      } catch (err) {
        // Fallback synthetic offline user if backend is not running
        const mockUser: User =
          targetRole === "patient"
            ? {
                id: "patient-1",
                email: "kaviya.sundaram@example.com",
                full_name: "Kaviya Sundaram",
                role: "patient",
                phone_number: "+91 98401 23456",
                created_at: new Date().toISOString(),
              }
            : {
                id: "caregiver-1",
                email: "anitha.nathan@example.com",
                full_name: "Dr. Anitha Nathan",
                role: "caregiver",
                phone_number: "+91 94440 98765",
                created_at: new Date().toISOString(),
              };
        setUser(mockUser);
        return mockUser;
      } finally {
        setIsLoading(false);
      }
    },
    [login]
  );

  const clearError = useCallback(() => setError(null), []);

  const role: UserRole = user ? user.role : "patient";
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        token,
        isAuthenticated,
        isLoading,
        error,
        login,
        register,
        logout,
        loginAsDemo,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
