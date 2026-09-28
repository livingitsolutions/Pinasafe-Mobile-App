// In-memory mock of @react-native-async-storage/async-storage for Jest.
const store = new Map<string, string>();

export default {
  getItem: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
  setItem: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    store.delete(key);
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
  __resetMockStorage: () => store.clear(),
};
