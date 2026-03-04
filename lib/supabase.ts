import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://nhjmwmkaduiaifgztymi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oam13bWthZHVpYWlmZ3p0eW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODk3MTYsImV4cCI6MjA4ODE2NTcxNn0.p53BZPf6qygAYw29bIJ0bA5VwZ_lRxw-aocV8LuGB1c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
