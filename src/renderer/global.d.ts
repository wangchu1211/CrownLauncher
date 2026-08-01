import type { CrownHost } from "../shared/contracts";

declare global {
  interface Window {
    crownHost: CrownHost;
  }
}

export {};
