import clear from "rollup-plugin-clear";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import {cwasm} from "rollup-plugin-cwasm-compiler";
import {terser} from "rollup-plugin-terser";

const WASM_PAGE_SIZE = 1 << 16;

export default [
  // Node
  {
    input: "src/index.ts",
    output: [
      {
        name: "nanpow",
        file: "dist/index.js",
        format: "cjs",
      },
      {
        name: "nanpow",
        file: "dist/index.mjs",
        format: "es"
      }
    ],
    plugins: [
      clear({
        targets: ["dist"]
      }),
      cwasm({
        "pow.c": {
          "clang": {
            "flags": `-O3 -Wall -Wno-unused-function -Wno-unused-variable -Wno-unused-parameter -Wno-unused-but-set-variable -c --target=wasm32`,
          },
          "wasm-ld": {
            "flags": `--no-entry --strip-all --allow-undefined --import-memory --export-dynamic --initial-memory=0 --max-memory=${WASM_PAGE_SIZE * 4}`,
          }
        }
      }),
      typescript({
        rollupCommonJSResolveHack: true,
        clean: true,
        tsconfig: "./tsconfig.json",
        module: "esnext"
      }),
      resolve(),
      commonjs({
        sourceMap: false,
        include: "node_modules/**"
      }),
    ]
  },
  // Browser
  {
    input: "src/index.ts",
    output: [
      {
        name: "nanpow",
        file: "dist/index.iife.min.js",
        format: "iife",
      },
    ],
    plugins: [
      clear({
        targets: ["dist"]
      }),
      cwasm({
        "pow.c": {
          "clang": {
            "flags": `-O3 -Wall -Wno-unused-function -Wno-unused-variable -Wno-unused-parameter -Wno-unused-but-set-variable -c --target=wasm32`,
          },
          "wasm-ld": {
            "flags": `--no-entry --strip-all --allow-undefined --import-memory --export-dynamic`,
          }
        }
      }),
      typescript({
        rollupCommonJSResolveHack: true,
        clean: true,
        tsconfig: "./tsconfig.json",
        module: "esnext"
      }),
      resolve({
        preferBuiltins: false,
        browser: true,
      }),
      commonjs({
        sourceMap: false,
        include: "node_modules/**"
      }),
      terser(),
    ]
  }
];
