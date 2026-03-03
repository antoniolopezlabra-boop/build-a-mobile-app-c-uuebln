import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import { apiGet, getBearerToken, BACKEND_URL } from "@/utils/api";
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
      console.log("[Auth] Checking session with /api/auth/get-session");
      // Use better-auth's get-session endpoint
      const response = await fetch(`${BACKEND_URL}/api/auth/get-session`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });
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
        // Fetch business profile
        try {
          const bp = await apiGet<BusinessProfile>("/api/business-profile");
          setBusinessProfile(bp);
        } catch {
          setBusinessProfile(null);
        }
        console.log("[Auth] Session restored for:", sessionData.user.email);
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
    // Use better-auth's sign-up/email endpoint
    // Pass businessName and businessType as extra fields for the afterHook
    const response = await fetch(`${BACKEND_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      const errorMsg = data?.message || data?.error || `Registration failed: ${response.status}`;
      throw new Error(errorMsg);
    }

    // Extract token from better-auth response
    const token = data?.token || data?.session?.token;
    if (!token) {
      throw new Error("No session token received from server");
    }

    await setBearerToken(token);
    setUser({
      id: data.user?.id || data?.session?.userId,
      email: data.user?.email || params.email,
      name: data.user?.name || params.name,
    });

    // Fetch business profile after registration
    try {
      const bp = await apiGet<BusinessProfile>("/api/business-profile");
      setBusinessProfile(bp);
    } catch {
      // Business profile may not be immediately available
    }
    console.log("[Auth] Registration successful:", params.email);
  };

  const login = async (email: string, password: string) => {
    console.log("[Auth] Logging in:", email);
    // Use better-auth's sign-in/email endpoint
    const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `Login failed: ${response.status}`;
      throw new Error(errorMsg);
    }

    // Extract token from better-auth response
    const token = data?.token || data?.session?.token;
    if (!token) {
      throw new Error("No session token received from server");
    }

    await setBearerToken(token);
    setUser({
      id: data.user?.id || data?.session?.userId,
      email: data.user?.email || email,
      name: data.user?.name || email,
    });

    // Fetch business profile after login
    try {
      const bp = await apiGet<BusinessProfile>("/api/business-profile");
      setBusinessProfile(bp);
    } catch {
      // Business profile may not be available
    }
    console.log("[Auth] Login successful:", email);
  };

  const signOut = async () => {
    try {
      console.log("[Auth] Signing out");
      // Call better-auth sign-out endpoint
      const token = await getBearerToken();
      if (token) {
        await fetch(`${BACKEND_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
        }).catch(() => {
          // Ignore sign-out errors - clear local state regardless
        });
      }
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
