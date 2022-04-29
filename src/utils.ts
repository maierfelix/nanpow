/**
 * Decodes the provided base64 encoded wasm stub
 * @param stub - The base64 wasm stub
 */
export function decodeWasmModule(stub: string): Uint8Array {
  const str = atob(stub);
  const buffer = new Uint8Array(str.length);
  for (let ii = 0; ii < str.length; ++ii) buffer[ii] = str.charCodeAt(ii);
  return buffer;
}
