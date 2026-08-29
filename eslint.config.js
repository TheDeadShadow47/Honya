// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // The RN useRef(new Animated.Value(0)).current idiom and manual useMemo/useCallback
      // triggered the new React Compiler heuristic rules from eslint-config-expo 57. These
      // flag valid, well-tested patterns as errors, so they are disabled here.
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);
