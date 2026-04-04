import type { CapacitorConfig } from "@capacitor/cli"

const cfg: CapacitorConfig = {
  appId: "ai.opencode.muxmobile",
  appName: "Mux Mobile",
  webDir: "dist",
  server: {
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
}

export default cfg
