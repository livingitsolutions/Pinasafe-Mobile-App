/** Minimal Jest setup for F2 foundation unit tests (no RN component rendering). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/__tests__/__mocks__/async-storage.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};
