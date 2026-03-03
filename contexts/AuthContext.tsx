import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { apiPost, apiGet, getBearerToken } from "@/utils/api";
import { BEARER_TOKEN_KEY, setBearerToken, clearAuthTokens } from "@/lib/auth";

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
}

interface AuthContextType {
  user: User | null;
  businessProfile: BusinessProfile | null;
  loading: boolean;
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

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const token = await getBearerToken();
      if (!token) {
        setUser(null);
        setBusinessProfile(null);
        return;
      }
      console.log("[Auth] Checking session with /api/auth/me");
      const data = await apiGet<{ user: User; businessProfile: BusinessProfile }>("/api/auth/me");
      setUser(data.user);
      setBusinessProfile(data.businessProfile || null);
      console.log("[Auth] Session restored for:", data.user.email);
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
      console.log("[Auth] Refreshing business profile");
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
    console.log("[Auth] Registering user:", params.email);
    const data = await apiPost<{ user: User; token: string }>("/api/auth/register", params);
    await setBearerToken(data.token);
    setUser(data.user);
    // Fetch business profile after registration
    try {
      const bp = await apiGet<BusinessProfile>("/api/business-profile");
      setBusinessProfile(bp);
    } catch {
      // Business profile may not be immediately available
    }
    console.log("[Auth] Registration successful:", data.user.email);
  };

  const login = async (email: string, password: string) => {
    console.log("[Auth] Logging in:", email);
    const data = await apiPost<{ user: User; token: string }>("/api/auth/login", { email, password });
    await setBearerToken(data.token);
    setUser(data.user);
    // Fetch business profile after login
    try {
      const bp = await apiGet<BusinessProfile>("/api/business-profile");
      setBusinessProfile(bp);
    } catch {
      // Business profile may not be available
    }
    console.log("[Auth] Login successful:", data.user.email);
  };

  const signOut = async () => {
    try {
      console.log("[Auth] Signing out");
    } catch (error) {
      console.error("[Auth] Sign out error:", error);
    } finally {
      setUser(null);
      setBusinessProfile(null);
      await clearAuthTokens();
      console.log("[Auth] Signed out, tokens cleared");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        businessProfile,
        loading,
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
