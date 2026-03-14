export function getHttpEndpoint(): string {
  const wsUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
  return wsUrl.replace(/^ws(s?):/, "http$1:");
}
