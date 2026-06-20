declare module 'murmurhash-js' {
  export function v2(str: string, seed?: number): number;
  export function v3(str: string, seed?: number): number;
  const murmurhash: {
    v2: typeof v2;
    v3: typeof v3;
  };
  export default murmurhash;
}
