
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

  useEffect(() => {
    // Wrap initial fetch in try/catch to prevent silent crashes
    const initializeAuth = async () => {
      try {
        console.log('[Auth] Initializing authentication...');
        await fetchUser();
      } catch (error) {
        console.error('[Auth] Failed to initialize auth:', error);
        // Set loading to false even if initialization fails
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const fetchUser = async () => {
    try {
      setLoading(true);
      console.log('[Auth] Fetching user session...');
      
      const token = await getBearerToken();
      if (!token) {
        console.log('[Auth] No token found, user not authenticated');
        setUser(null);
        setBusinessProfile(null);
        setLoading(false);
        return;
      }

      console.log("[Auth] Checking session with /api/auth/get-session");
      
      // Add timeout to prevent hanging on slow backend
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/get-session`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`[Auth] Session check failed with status: ${response.status}`);
          throw new Error(`Session check failed: ${response.status}`);
        }

        const sessionData = await response.json();
        
        if (sessionData?.user) {
          console.log('[Auth] Session valid, user authenticated');
          setUser({
            id: sessionData.user.id,
            email: sessionData.user.email,
            name: sessionData.user.name,
          });

          // Fetch business profile with timeout
          try {
            const bp = await apiGet<BusinessProfile>("/api/business-profile");
            console.log('[Auth] Business profile loaded');
            setBusinessProfile(bp);
          } catch (bpError) {
            console.warn('[Auth] Failed to load business profile:', bpError);
            setBusinessProfile(null);
          }

          console.log("[Auth] Session restored for:", sessionData.user.email);
        } else {
          console.log('[Auth] No user in session data');
          setUser(null);
          setBusinessProfile(null);
          await clearAuthTokens();
        }
      } catch (fetchError: any) {
        if (fetchError.name === 'AbortError') {
          console.error('[Auth] Session check timed out - backend may be slow');
        } else {
          console.error('[Auth] Session check network error:', fetchError);
        }
        throw fetchError;
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
      console.log('[Auth] Business profile refreshed successfully');
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
      setAuthLoading(true);
      console.log("[Auth] Registering user:", params.email);
      
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
        console.error('[Auth] Registration failed:', errorMsg);
        throw new Error(errorMsg);
      }

      // Extract token from better-auth response
      const token = data?.token || data?.session?.token;
      if (!token) {
        console.error('[Auth] No token in registration response');
        throw new Error("No session token received from server");
      }

      console.log('[Auth] Registration successful, setting token and user state');
      await setBearerToken(token);
      
      // Set user state immediately to trigger navigation
      const newUser = {
        id: data.user?.id || data?.session?.userId,
        email: data.user?.email || params.email,
        name: data.user?.name || params.name,
      };
      
      // Update state synchronously
      setUser(newUser);
      console.log('[Auth] User state updated:', newUser.email);

      // Fetch business profile after registration
      try {
        const bp = await apiGet<BusinessProfile>("/api/business-profile");
        setBusinessProfile(bp);
        console.log('[Auth] Business profile loaded after registration');
      } catch (bpError) {
        console.warn('[Auth] Business profile not available yet:', bpError);
      }
      
      console.log("[Auth] Registration complete for:", params.email);
      
      // Force a small delay to ensure state propagates
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('[Auth] Registration error:', error);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setAuthLoading(true);
      console.log("[Auth] Logging in:", email);
      
      const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        const errorMsg = data?.message || data?.error || `Login failed: ${response.status}`;
        console.error('[Auth] Login failed:', errorMsg);
        throw new Error(errorMsg);
      }

      // Extract token from better-auth response
      const token = data?.token || data?.session?.token;
      if (!token) {
        console.error('[Auth] No token in login response');
        throw new Error("No session token received from server");
      }

      console.log('[Auth] Login successful, setting token and user state');
      await setBearerToken(token);
      
      // Set user state immediately to trigger navigation
      const newUser = {
        id: data.user?.id || data?.session?.userId,
        email: data.user?.email || email,
        name: data.user?.name || email,
      };
      setUser(newUser);
      console.log('[Auth] User state updated:', newUser.email);

      // Fetch business profile after login
      try {
        const bp = await apiGet<BusinessProfile>("/api/business-profile");
        setBusinessProfile(bp);
        console.log('[Auth] Business profile loaded after login');
      } catch (bpError) {
        console.warn('[Auth] Business profile not available:', bpError);
      }
      
      console.log("[Auth] Login complete for:", email);
      
      // Force a small delay to ensure state propagates
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setAuthLoading(true);
      console.log("[Auth] Signing out");
      
      // Call better-auth sign-out endpoint
      const token = await getBearerToken();
      if (token) {
        try {
          await fetch(`${BACKEND_URL}/api/auth/sign-out`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
          });
        } catch (signOutError) {
          console.warn('[Auth] Sign-out API call failed, clearing local state anyway:', signOutError);
        }
      }
    } catch (error) {
      console.error("[Auth] Sign out error:", error);
    } finally {
      // ALWAYS clear local state, even if API call fails
      setUser(null);
      setBusinessProfile(null);
      await clearAuthTokens();
      setAuthLoading(false);
      console.log("[Auth] Signed out, tokens cleared");
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
