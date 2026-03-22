import React from 'react';
import { useRouter } from 'expo-router';
import StaffFormScreen from '@/components/StaffFormScreen';

export default function NewStaffScreen() {
  const router = useRouter();
  return (
    <StaffFormScreen
      mode="create"
      onSaved={() => router.back()}
      onCancel={() => router.back()}
    />
  );
}
