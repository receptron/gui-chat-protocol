import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      include: ["src/**/*.ts"],
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        vue: "src/vue.ts",
        react: "src/react.ts",
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => {
        const ext = format === "es" ? "js" : "cjs";
        return `${entryName}.${ext}`;
      },
    },
    rollupOptions: {
      external: ["vue", "react"],
      output: {
        exports: "named",
      },
    },
    minify: false,
    sourcemap: true,
  },
});
