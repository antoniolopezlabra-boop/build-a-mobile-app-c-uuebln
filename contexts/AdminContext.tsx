import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

interface AdminUser {
  id: string;
  userId: string;
  email: string;
  role: 'superadmin' | 'admin';
  name: string;
}

interface AdminContextType {
  adminUser: AdminUser | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
  checkAdminAccess: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType>({
  adminUser: null,
  isAdmin: false,
  isSuperAdmin: false,
  loading: true,
  checkAdminAccess: async () => {},
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAdminAccess = async (userId?: string) => {
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id;
    if (!uid) {
      setAdminUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('vylta_admins')
        .select('*')
        .eq('user_id', uid)
        .eq('is_active', true)
        .single();

      console.log('[AdminContext] result for', uid, ':', data?.role ?? 'not admin', error?.code ?? '');

      if (error || !data) {
        setAdminUser(null);
      } else {
        setAdminUser({
          id: data.id,
          userId: data.user_id,
          email: data.email,
          role: data.role,
          name: data.name,
        });
      }
    } catch {
      setAdminUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Reaccionar al cambio de usuario (login/logout)
  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setAdminUser(null);
      setLoading(false);
      return;
    }
    checkAdminAccess(user.id);
  }, [user?.id, authLoading]);

  return (
    <AdminContext.Provider value={{
      adminUser,
      isAdmin: !!adminUser,
      isSuperAdmin: adminUser?.role === 'superadmin',
      loading,
      checkAdminAccess,
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
