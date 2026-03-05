import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[Admin] Checking user:', user?.id);
      if (!user) { setAdminUser(null); setLoading(false); return; }

      const { data, error } = await supabase
        .from('vylta_admins')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      console.log('[Admin] DB result:', data, error);
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

  useEffect(() => { checkAdminAccess(); }, []);

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
