import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

const eslintConfig = [
  {
    ignores: [
      ".next/",
      "node_modules/",
      "out/",
      "build/",
      "playwright-report/",
      "test-results/",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
]

export default eslintConfig
