import { useEffect, useState } from 'react';

import { Icon, Row, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C } from '@/ui/theme';

export function fmtElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** 전체 운동 타이머 (요구사항 8): 시작 시각 기준이라 앱을 껐다 켜도 이어진다 */
export function ElapsedClock({ startedAt, size = 'h3' }: { startedAt: string; size?: 'h3' | 'h2' | 'h1' }) {
  const calc = () => Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const [sec, setSec] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setSec(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <Row gap={6}>
      <Icon name={IC.timer} size={size === 'h3' ? 16 : 20} color={C.accent} />
      <Text v={size} style={{ fontVariant: ['tabular-nums'] }}>
        {fmtElapsed(sec)}
      </Text>
    </Row>
  );
}
