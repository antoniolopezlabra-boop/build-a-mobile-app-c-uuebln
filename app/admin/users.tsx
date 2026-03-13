import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// users.tsx consolidado en tenants.tsx — redirigir para no romper links viejos
export default function UsersRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/tenants'); }, []);
  return null;
}
