// hls.js ships type declarations for its main entry only. The light build (no subtitles, alternate audio or DRM, which
// the theater doesn't use) has the same API, so point its subpath at those declarations.
declare module "hls.js/light" {
  export * from "hls.js";
  export { default } from "hls.js";
}
