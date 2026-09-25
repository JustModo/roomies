/** Vite `?url` imports resolve to the emitted asset's URL. */
declare module '*?url' {
  const url: string;
  export default url;
}
