import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import StaffFormScreen from '@/components/StaffFormScreen';

export default function EditStaffScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <StaffFormScreen
      mode="edit"
      staffId={id}
      onSaved={() => router.back()}
      onCancel={() => router.back()}
    />
  );
}
