import type { CrownHost } from "../Shared/contracts";

declare global {
  interface Window {
    crownHost: CrownHost;
  }
}

export {};
