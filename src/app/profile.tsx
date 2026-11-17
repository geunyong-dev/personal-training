import { router } from 'expo-router';

import { ProfileForm } from '@/features/onboarding/ProfileForm';
import { useApp } from '@/store/app-store';
import { Screen } from '@/ui/kit';

export default function EditProfile() {
  const profile = useApp((s) => s.profile);
  const save = useApp((s) => s.saveProfile);
  return (
    <Screen edges={['bottom']}>
      <ProfileForm
        initial={profile}
        submitLabel="저장"
        onSubmit={(p) => {
          save(p);
          router.back();
        }}
      />
    </Screen>
  );
}
