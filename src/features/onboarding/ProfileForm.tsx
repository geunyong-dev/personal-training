import { useState } from 'react';
import { Switch } from 'react-native';

import { EQUIPMENT_KO } from '@/data/exercises';
import { validateNickname } from '@/domain/rules';
import type { Equipment, Goal, Level, Profile } from '@/domain/types';
import { isNicknameTaken } from '@/lib/supabase';
import { Button, Card, Chip, Field, Row, Text } from '@/ui/kit';
import { C, S } from '@/ui/theme';

const GOALS: [Goal, string][] = [
  ['muscle', '근성장'],
  ['strength', '근력'],
  ['fat_loss', '체지방 감량'],
  ['health', '건강 유지'],
];
const LEVELS: [Level, string][] = [
  ['beginner', '입문 (6개월 미만)'],
  ['intermediate', '중급 (6개월~2년)'],
  ['advanced', '고급 (2년 이상)'],
];

export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Profile | null;
  submitLabel: string;
  onSubmit: (p: Profile) => void;
}) {
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? 'muscle');
  const [level, setLevel] = useState<Level>(initial?.level ?? 'beginner');
  const [freq, setFreq] = useState(initial?.weeklyFreq ?? 3);
  const [equipment, setEquipment] = useState<Equipment[]>(initial?.equipment ?? ['barbell', 'dumbbell', 'machine', 'cable']);
  const [consentBody, setConsentBody] = useState(initial?.consentBody ?? false);
  const [height, setHeight] = useState(initial?.heightCm ? String(initial.heightCm) : '');
  const [weight, setWeight] = useState(initial?.weightKg ? String(initial.weightKg) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleEq = (e: Equipment) =>
    setEquipment((xs) => (xs.includes(e) ? xs.filter((x) => x !== e) : [...xs, e]));

  const submit = async () => {
    const nickErr = validateNickname(nickname);
    if (nickErr) return setError(nickErr);
    setBusy(true);
    try {
      if (nickname.trim() !== initial?.nickname && (await isNicknameTaken(nickname.trim()))) {
        return setError('이미 쓰고 있는 닉네임이에요');
      }
      onSubmit({
        nickname: nickname.trim(),
        goal,
        level,
        weeklyFreq: freq,
        equipment,
        consentBody,
        heightCm: consentBody && height ? Number(height) : undefined,
        weightKg: consentBody && weight ? Number(weight) : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="닉네임 (2~12자, 한글·영문·숫자·_)" value={nickname} onChangeText={(t) => { setNickname(t); setError(null); }} maxLength={12} />

      <Card>
        <Text v="small" dim>목표</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {GOALS.map(([g, l]) => <Chip key={g} label={l} selected={goal === g} onPress={() => setGoal(g)} />)}
        </Row>
        <Text v="small" dim>운동 경력</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {LEVELS.map(([g, l]) => <Chip key={g} label={l} selected={level === g} onPress={() => setLevel(g)} />)}
        </Row>
        <Text v="small" dim>주 몇 회 운동하나요?</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} label={`${n}회`} selected={freq === n} onPress={() => setFreq(n)} />)}
        </Row>
        <Text v="small" dim>쓸 수 있는 장비</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {(Object.keys(EQUIPMENT_KO) as Equipment[])
            .filter((e) => e !== 'bodyweight')
            .map((e) => <Chip key={e} label={EQUIPMENT_KO[e]} selected={equipment.includes(e)} onPress={() => toggleEq(e)} />)}
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ flex: 1 }}>키·체중 저장에 동의 (선택)</Text>
          <Switch value={consentBody} onValueChange={setConsentBody} trackColor={{ true: C.accent, false: C.surface2 }} thumbColor="#ffffff" />
        </Row>
        <Text v="small" faint>
          동의하지 않아도 모든 기능을 쓸 수 있어요. 키·체중은 광고에 쓰지 않아요.
        </Text>
        {consentBody ? (
          <Row gap={S.md}>
            <Field label="키 (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" style={{ width: 120 }} />
            <Field label="체중 (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" style={{ width: 120 }} />
          </Row>
        ) : null}
      </Card>

      {error ? <Text color={C.danger}>{error}</Text> : null}
      <Button title={busy ? '확인 중…' : submitLabel} disabled={busy} onPress={() => void submit()} />
    </>
  );
}
