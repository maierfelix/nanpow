import {decodeWasmModule} from "./utils";

import CrossWorker from "./polyfills/worker";

// @ts-ignore
import powC from "c:./pow.c";

// Pre-decode simulation wasm code
const POW_CODE = decodeWasmModule(powC);

/**
 * Thread action messages
 */
const THREAD_ACTION_INIT = 0;
const THREAD_ACTION_INIT_DONE = 1;
const THREAD_ACTION_UPDATE = 2;
const THREAD_ACTION_UPDATE_DONE = 3;

/**
 * Interface representing a thread object
 */
interface IThread {
  id: number;
  worker: CrossWorker;
}

/**
 * Interface representing a thread message
 */
interface IThreadMessage {
  action: number;
  data?: Uint8Array;
}

/**
 * Interface representing a thread initialization message
 */
interface IThreadInitMessage extends IThreadMessage {
  id: number;
  module: WebAssembly.Module;
}

/**
 * Interface representing a thread update message
 */
interface IThreadUpdateMessage extends IThreadMessage {
  difficulty: number;
  work0: Uint8Array;
  work1: Uint8Array;
  hash0: Uint8Array;
  hash1: Uint8Array;
  blockSize: number;
  blockOffsetX: number;
  blockOffsetY: number;
}

function hexReverse(hex: string): string {
  let out = "";
  for (let i = hex.length; i > 0; i -= 2) {
    out += hex.slice(i - 2, i);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.prototype.map.call(bytes, (x) => ("00" + x.toString(16)).slice(-2)).join("").toUpperCase();
}

/**
 * Inline worker code
 */
const WORKER_CODE = function(): void {

  /**
   * Thread action messages
   */
  const THREAD_ACTION_INIT = 0;
  const THREAD_ACTION_INIT_DONE = 1;
  const THREAD_ACTION_UPDATE = 2;
  const THREAD_ACTION_UPDATE_DONE = 3;

  let ctx: any = null;
  // @ts-ignore
  if (typeof WorkerGlobalScope !== "undefined") {
    // Running inside browser
    ctx = self;
  } else {
    // Running inside node
    const {parentPort} = require("worker_threads");
    // Bridge calls to match web worker API
    ctx = {};
    ctx.postMessage = (e: any): void => {
      parentPort.postMessage(e);
    };
    ctx.addEventListener = function(_type: string, callback: any): void {
      parentPort.on("message", (e: any) => {
        callback({data: e});
      });
    };
  }

  function arrayHex(arr: Uint8Array, length: number): string {
    let out = "";
    for (let i = length - 1; i > -1; i--) {
      out += (arr[i] > 15 ? "" : "0") + arr[i].toString(16);
    }
    return out;
  }

  function hexToBytes(hex: string): Uint8Array {
    const result = new Uint8Array(hex.length / 2);
    for (let ii = 0; ii < result.length; ++ii) {
      result[ii] = parseInt(hex.substring((ii * 2) + 0, (ii * 2) + 2), 16);
    }
    return result;
  }

  function uint32ToRGBA8(uint32: number): Uint8Array {
    return new Uint8Array([
      (uint32 >> 24) & 0xFF,
      (uint32 >> 16) & 0xFF,
      (uint32 >> 8) & 0xFF,
      (uint32 >> 0) & 0xFF
    ]);
  }

  // Global webassembly properties
  let exports: any = null;
  // Handle incoming messages from the main thread
  ctx.addEventListener("message", (e: MessageEvent): void => {
    const {data} = e;
    // Initialization message
    if (data.action === THREAD_ACTION_INIT) {
      const packet = data as IThreadInitMessage;
      // Allocate main-thread wasm module
      (async(): Promise<void> => {
        const memory = new WebAssembly.Memory({initial: 4, maximum: 4});
        const imports: any = {env: {
          memory,
        }};
        const wasm = await WebAssembly.instantiate(packet.module, imports);
        exports = (wasm.exports as any);
        ctx.postMessage({action: THREAD_ACTION_INIT_DONE});
      })();
    }
    // Update message
    else if (data.action === THREAD_ACTION_UPDATE) {
      const packet = data as IThreadUpdateMessage;
      const {difficulty, hash0, hash1, work0, work1, blockOffsetX, blockOffsetY, blockSize} = packet;
      const resultU32 = exports.Calculate(
        blockOffsetX, blockOffsetY,
        blockSize,
        difficulty,
        work0[0], work0[1], work0[2], work0[3],
        work1[0], work1[1], work1[2], work1[3],
        hash0[0], hash0[1], hash0[2], hash0[3],
        hash1[0], hash1[1], hash1[2], hash1[3]
      );
      let hash: Uint8Array = null;
      if (resultU32 !== 0) {
        // Extract result
        const resultRGBAU8 = uint32ToRGBA8(resultU32);
        const result = new Uint8Array([
          resultRGBAU8[2],
          resultRGBAU8[3],
          work0[2] ^ (resultRGBAU8[0] - 1),
          work0[3] ^ (resultRGBAU8[1] - 1)
        ]);
        const hexA = arrayHex(work1, 4);
        const hexB = arrayHex(result, 4);
        hash = hexToBytes(hexA + hexB);
      }
      ctx.postMessage({action: THREAD_ACTION_UPDATE_DONE, data: hash});
    }
  });

}.toString();

const MAX_WORKER_COUNT = 16;

const threads: IThread[] = [];
let module: WebAssembly.WebAssemblyInstantiatedSource = null;

async function create(): Promise<void> {
  // Create the wasm module
  const memory = new WebAssembly.Memory({initial: 4, maximum: 4});
  const imports: any = {env: {
    memory,
  }};
  module = await WebAssembly.instantiate(POW_CODE, imports);
  // Create threads
  for (let ii = 0; ii < MAX_WORKER_COUNT; ++ii) {
    const threadId = ii;
    const worker = new CrossWorker(`(${WORKER_CODE})();`);
    threads.push({id: threadId, worker});
  }
  return new Promise(resolve => {
    // Initialize threads
    let threadInitCounter = 0;
    // Initialize the threads
    for (let ii = 0; ii < threads.length; ++ii) {
      const thread = threads[ii];
      const packet: IThreadInitMessage = {
        id: ii,
        module: module.module,
        action: THREAD_ACTION_INIT,
      };
      // Clear previous thread message listener
      thread.worker.onmessage = null;
      // Create new thread message listener
      thread.worker.onmessage = (e: any): void => {
        const {data} = e;
        const packet = data as IThreadMessage;
        // Thread notified that the initialization is done
        if (packet.action === THREAD_ACTION_INIT_DONE) {
          // Resolve when all threads finished initialization
          if (++threadInitCounter >= threads.length) {
            resolve();
          }
        }
      };
      thread.worker.postMessage(packet);
    }
  });
}

const BLOCK_SIZE = 256;

/**
 * Calculates PoW based on the provided hash and difficulty
 * @param hash - The hash to calculate PoW for
 * @param difficulty - The difficulty of the PoW to calculate for
 */
export async function getWork(hash: Uint8Array, difficulty: number): Promise<Uint8Array> {
  // If module isn't created yet, then create it first
  if (module === null) await create();

  const reverseHex = hexReverse(bytesToHex(hash));

  const hash0 = new Uint32Array([
    parseInt(reverseHex.slice(56, 64), 16),
    parseInt(reverseHex.slice(48, 56), 16),
    parseInt(reverseHex.slice(40, 48), 16),
    parseInt(reverseHex.slice(32, 40), 16),
  ]);

  const hash1 = new Uint32Array([
    parseInt(reverseHex.slice(24, 32), 16),
    parseInt(reverseHex.slice(16, 24), 16),
    parseInt(reverseHex.slice(8, 16), 16),
    parseInt(reverseHex.slice(0, 8), 16),
  ]);

  // Run until match
  return new Promise(resolve => {
    setTimeout(function updateLoop() {
      const work0 = new Uint8Array([
        (Math.random() * 0xFF) | 0,
        (Math.random() * 0xFF) | 0,
        (Math.random() * 0xFF) | 0,
        (Math.random() * 0xFF) | 0,
      ]);
      const work1 = new Uint8Array([
        (Math.random() * 0xFF) | 0,
        (Math.random() * 0xFF) | 0,
        (Math.random() * 0xFF) | 0,
        (Math.random() * 0xFF) | 0,
      ]);
      let isResolved = false;
      let threadUpdateCounter = 0;
      for (let yy = 0; yy < 4; ++yy) {
        for (let xx = 0; xx < 4; ++xx) {
          const bx = xx;
          const by = yy;
          const {worker} = threads[(by * 4) + bx];
          worker.onmessage = (e: any): void => {
            const {data} = e;
            const packet = data as IThreadMessage;
            // Thread notified that the work is done
            if (packet.action === THREAD_ACTION_UPDATE_DONE) {
              // Found a match
              if (packet.data !== null) {
                // Terminate all workers
                //for (let ii = 0; ii < threads.length; ++ii) {
                //  threads[ii].worker.terminate();
                //}
                // We can abort now
                if (!isResolved) {
                  resolve(packet.data);
                  isResolved = true;
                }
              }
              else if (++threadUpdateCounter >= threads.length) {
                // Continue update loop
                setTimeout(updateLoop);
              }
            }
          };
          const packet: IThreadUpdateMessage = {
            action: THREAD_ACTION_UPDATE,
            difficulty: difficulty,
            hash0: hash0 as any,
            hash1: hash1 as any,
            work0: work0,
            work1: work1,
            blockSize: BLOCK_SIZE,
            blockOffsetX: bx * BLOCK_SIZE,
            blockOffsetY: by * BLOCK_SIZE,
          };
          worker.postMessage(packet);
        }
      }
    });
  });

}
