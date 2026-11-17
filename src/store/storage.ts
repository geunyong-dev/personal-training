// 네이티브에서는 expo-sqlite 기반 localStorage 폴리필, 웹에서는 브라우저 localStorage를 쓴다.
import 'expo-sqlite/localStorage/install';
import { createJSONStorage } from 'zustand/middleware';

export const persistStorage = createJSONStorage(() => globalThis.localStorage);
