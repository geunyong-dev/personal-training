import { router } from 'expo-router';

import { ProfileForm } from '@/features/onboarding/ProfileForm';
import { syncNow } from '@/lib/sync';
import { useApp } from '@/store/app-store';
import { notice } from '@/ui/confirm';
import { Screen, Text } from '@/ui/kit';

export default function OnboardingProfile() {
  const profile = useApp((s) => s.profile);
  const save = useApp((s) => s.saveProfile);
  return (
    <Screen edges={['bottom']}>
      <Text dim>목표·주 횟수·장비로 첫 루틴을 추천해 드려요. Claude도 이 정보를 참고해요.</Text>
      <ProfileForm
        initial={profile}
        submitLabel="다음"
        onSubmit={async (p) => {
          save(p);
          try {
            await syncNow(); // 서버에 프로필 생성 (닉네임 중복은 DB unique 제약으로 한 번 더 막힌다)
          } catch {
            notice('저장에 실패했어요', '네트워크를 확인하고 다시 시도해 주세요.');
            return;
          }
          router.push('/onboarding/connect');
        }}
      />
    </Screen>
  );
}
