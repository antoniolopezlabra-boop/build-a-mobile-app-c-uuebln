import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { apiGet, getBearerToken, BACKEND_URL } from "@/utils/api";
import { setBearerToken, clearAuthTokens } from "@/lib/auth";

interface User {
  id: string;
  email: string;
  name: string;
}

interface BusinessProfile {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  address?: string | null;
  phone?: string | null;
  alternativePhone?: string | null;
  logoUrl?: string | null;
  weeklySchedule?: any;
}

interface AuthContextType {
  user: User | null;
  businessProfile: BusinessProfile | null;
  loading: boolean;
  authLoading: boolean;
  register: (params: {
    email: string;
    password: string;
    name: string;
    businessName: string;
    businessType: string;
  }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
  refreshBusinessProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const isAuthenticating = useRef(false);

  useEffect(() => {
    // Only run initial session check if not in the middle of login/register
    if (!isAuthenticating.current) {
      initializeAuth();
    }
  }, []);

  const initializeAuth = async () => {
    try {
      console.log('[Auth] Initializing...');
      const token = await getBearerToken();
      if (!token) {
        console.log('[Auth] No token, showing auth screens');
        setUser(null);
        setBusinessProfile(null);
        setLoading(false);
        return;
      }
      await fetchUser();
    } catch (error) {
      console.error('[Auth] Init failed:', error);
      setUser(null);
      setBusinessProfile(null);
      setLoading(false);
    }
  };

  const fetchUser = async () => {
    try {
      setLoading(true);
      const token = await getBearerToken();
      if (!token) {
        setUser(null);
        setBusinessProfile(null);
        setLoading(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${BACKEND_URL}/api/auth/get-session`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "Origin": BACKEND_URL,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Session check failed: ${response.status}`);
      }

      const sessionData = await response.json();

      if (sessionData?.user) {
        setUser({
          id: sessionData.user.id,
          email: sessionData.user.email,
          name: sessionData.user.name,
        });
        try {
          const bp = await apiGet<BusinessProfile>("/api/business-profile");
          setBusinessProfile(bp);
        } catch {
          setBusinessProfile(null);
        }
      } else {
        setUser(null);
        setBusinessProfile(null);
        await clearAuthTokens();
      }
    } catch (error) {
      console.error("[Auth] Session check failed:", error);
      setUser(null);
      setBusinessProfile(null);
      await clearAuthTokens();
    } finally {
      setLoading(false);
    }
  };

  const refreshBusinessProfile = async () => {
    try {
      const data = await apiGet<BusinessProfile>("/api/business-profile");
      setBusinessProfile(data);
    } catch (error) {
      console.error("[Auth] Failed to refresh business profile:", error);
    }
  };

  const register = async (params: {
    email: string;
    password: string;
    name: string;
    businessName: string;
    businessType: string;
  }) => {
    try {
      isAuthenticating.current = true;
      setAuthLoading(true);

      const response = await fetch(`${BACKEND_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": BACKEND_URL,
        },
        body: JSON.stringify({
          name: params.name,
          email: params.email,
          password: params.password,
          businessName: params.businessName,
          businessType: params.businessType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || data?.error || `Registration failed: ${response.status}`);
      }

      const token = data?.token || data?.session?.token;
      if (!token) {
        throw new Error("No session token received from server");
      }

      await setBearerToken(token);

      const newUser = {
        id: data.user?.id || data?.session?.userId || "",
        email: data.user?.email || params.email,
        name: data.user?.name || params.name,
      };

      // Set loading false BEFORE setting user to prevent blank screen
      setLoading(false);
      setUser(newUser);

      try {
        const bp = await apiGet<BusinessProfile>("/api/business-profile");
        setBusinessProfile(bp);
      } catch {
        setBusinessProfile(null);
      }

    } catch (error) {
      console.error('[Auth] Registration error:', error);
      throw error;
    } finally {
      setAuthLoading(false);
      isAuthenticating.current = false;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      isAuthenticating.current = true;
      setAuthLoading(true);

      const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": BACKEND_URL,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || data?.error || `Login failed: ${response.status}`);
      }

      const token = data?.token || data?.session?.token;
      if (!token) {
        throw new Error("No session token received from server");
      }

      await setBearerToken(token);

      const newUser = {
        id: data.user?.id || data?.session?.userId || "",
        email: data.user?.email || email,
        name: data.user?.name || email,
      };

      // Set loading false BEFORE setting user to prevent blank screen
      setLoading(false);
      setUser(newUser);

      try {
        const bp = await apiGet<BusinessProfile>("/api/business-profile");
        setBusinessProfile(bp);
      } catch {
        setBusinessProfile(null);
      }

    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    } finally {
      setAuthLoading(false);
      isAuthenticating.current = false;
    }
  };

  const signOut = async () => {
    try {
      setAuthLoading(true);
      const token = await getBearerToken();
      if (token) {
        try {
          await fetch(`${BACKEND_URL}/api/auth/sign-out`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
              "Origin": BACKEND_URL,
            },
          });
        } catch (e) {
          console.warn('[Auth] Sign-out API failed, clearing local state anyway');
        }
      }
    } catch (error) {
      console.error("[Auth] Sign out error:", error);
    } finally {
      setUser(null);
      setBusinessProfile(null);
      await clearAuthTokens();
      setLoading(false);
      setAuthLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        businessProfile,
        loading,
        authLoading,
        register,
        login,
        signOut,
        fetchUser,
        refreshBusinessProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}