// iOS 잠금화면·Dynamic Island 휴식 타이머 (Live Activity)
// 'widget' 컴포넌트는 격리된 런타임에서 돌아서 훅·import 값·모듈 스코프 값을 쓸 수 없다.
import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type RestTimerProps = {
  /** 휴식 시작·종료 시각 (epoch ms) */
  startMs: number;
  endMs: number;
  exerciseName: string;
  nextSetLabel: string; // 예: "3세트 · 60kg × 10"
  /** 일시정지 상태면 정지 시각 (epoch ms) */
  pausedAtMs?: number;
};

const RestTimer = (props: RestTimerProps, environment: LiveActivityEnvironment) => {
  'widget';
  const range = { lower: new Date(props.startMs), upper: new Date(props.endMs) };
  const pause = props.pausedAtMs ? new Date(props.pausedAtMs) : undefined;
  return {
    banner: (
      <HStack>
        <VStack>
          <Text>휴식 중</Text>
          <Text>{props.exerciseName}</Text>
          <Text>다음: {props.nextSetLabel}</Text>
        </VStack>
        <Text timerInterval={range} countsDown pauseTime={pause} />
      </HStack>
    ),
    compactLeading: <Text>휴식</Text>,
    compactTrailing: <Text timerInterval={range} countsDown pauseTime={pause} />,
    minimal: <Text timerInterval={range} countsDown pauseTime={pause} />,
    expandedLeading: <Text>{props.exerciseName}</Text>,
    expandedTrailing: <Text timerInterval={range} countsDown pauseTime={pause} />,
    expandedBottom: <Text>다음: {props.nextSetLabel}</Text>,
  };
};

export default createLiveActivity<RestTimerProps>('RestTimerActivity', RestTimer);
