/**
 * KSP GatePass logo mark: path data on a 100 x 100 grid (corner radius 4).
 * Single source of truth for the React component and for PDFs. Keep in sync with
 * public/brand/logo-mark.svg. The "small" variant has a wider gap for sizes under 40 px.
 */
export const LOGO_MARK = {
  viewBox: "0 0 100 100",
  default: [
    "M0 6.481A4 4 0 0 1 5.793 2.906L28.493 14.292A4 4 0 0 1 30.7 17.868L30.7 82.132A4 4 0 0 1 28.493 85.708L5.793 97.094A4 4 0 0 1 0 93.519Z",
    "M49.344 15.4A4 4 0 0 0 47.555 22.978L63.489 30.944A4 4 0 0 1 65.7 34.522L65.7 65.478A4 4 0 0 1 63.489 69.056L47.555 77.022A4 4 0 0 0 49.344 84.6L96 84.6A4 4 0 0 0 100 80.6L100 19.4A4 4 0 0 0 96 15.4Z",
  ],
  small: [
    "M0 6.481A4 4 0 0 1 5.793 2.906L24.193 12.135A4 4 0 0 1 26.4 15.711L26.4 84.289A4 4 0 0 1 24.193 87.865L5.793 97.094A4 4 0 0 1 0 93.519Z",
    "M49.344 15.4A4 4 0 0 0 47.555 22.978L63.489 30.944A4 4 0 0 1 65.7 34.522L65.7 65.478A4 4 0 0 1 63.489 69.056L47.555 77.022A4 4 0 0 0 49.344 84.6L96 84.6A4 4 0 0 0 100 80.6L100 19.4A4 4 0 0 0 96 15.4Z",
  ],
} as const;

export type LogoMarkVariant = "default" | "small";
