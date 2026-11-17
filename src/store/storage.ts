// 로컬 JSON 저장 (요구사항 10)
// 네이티브: 앱 문서 폴더의 <이름>.json 파일, 웹: localStorage
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const fileFor = (name: string) => new File(Paths.document, `${name}.json`);

const jsonFileStorage: StateStorage = {
  getItem: async (name) => {
    const f = fileFor(name);
    return f.exists ? await f.text() : null;
  },
  setItem: async (name, value) => {
    const f = fileFor(name);
    if (!f.exists) f.create({ intermediates: true });
    await f.write(value);
  },
  removeItem: async (name) => {
    const f = fileFor(name);
    if (f.exists) f.delete();
  },
};

export const persistStorage = createJSONStorage(() =>
  Platform.OS === 'web' ? (globalThis.localStorage as StateStorage) : jsonFileStorage,
);
