// iOS 잠금화면·Dynamic Island: 전체 운동 타이머 + 휴식 타이머 (Live Activity)
// 'widget' 컴포넌트는 격리된 런타임에서 돌아서 훅·import 값·모듈 스코프 값을 쓸 수 없다.
import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type WorkoutActivityProps = {
  title: string; // 예: "오늘의 운동 · 가슴"
  startMs: number; // 운동 시작 시각 → 전체 타이머(올라가는 시계)
  exerciseName: string;
  setLabel: string; // 예: "2/4세트 · 80kg × 8"
  restStartMs?: number; // 휴식 중일 때만
  restEndMs?: number;
  restPausedAtMs?: number;
};

const WorkoutActivity = (props: WorkoutActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const elapsed = { lower: new Date(props.startMs), upper: new Date(props.startMs + 12 * 3600 * 1000) };
  const rest =
    props.restEndMs != null && props.restStartMs != null
      ? { lower: new Date(props.restStartMs), upper: new Date(props.restEndMs) }
      : undefined;
  const pause = props.restPausedAtMs ? new Date(props.restPausedAtMs) : undefined;
  return {
    banner: (
      <HStack>
        <VStack>
          <Text>{props.title}</Text>
          <Text>{props.exerciseName}</Text>
          <Text>{props.setLabel}</Text>
        </VStack>
        <VStack>
          <Text timerInterval={elapsed} countsDown={false} />
          {rest ? <Text timerInterval={rest} countsDown pauseTime={pause} /> : <Text>운동 중</Text>}
        </VStack>
      </HStack>
    ),
    compactLeading: rest ? <Text>휴식</Text> : <Text timerInterval={elapsed} countsDown={false} />,
    compactTrailing: rest ? <Text timerInterval={rest} countsDown pauseTime={pause} /> : <Text>{props.setLabel}</Text>,
    minimal: rest ? <Text timerInterval={rest} countsDown pauseTime={pause} /> : <Text timerInterval={elapsed} countsDown={false} />,
    expandedLeading: <Text>{props.exerciseName}</Text>,
    expandedTrailing: <Text timerInterval={elapsed} countsDown={false} />,
    expandedBottom: rest ? <Text timerInterval={rest} countsDown pauseTime={pause} /> : <Text>{props.setLabel}</Text>,
  };
};

export default createLiveActivity<WorkoutActivityProps>('WorkoutActivity', WorkoutActivity);
