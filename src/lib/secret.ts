// 기기 비밀키: 동기화 서버가 이 기기를 확인하는 데 쓴다. 기기 밖으로는 Authorization 헤더로만 나간다
import { getRandomBytes } from 'expo-crypto';

export function newDeviceSecret(): string {
  return Array.from(getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
}
