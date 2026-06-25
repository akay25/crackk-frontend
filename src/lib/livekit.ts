// LiveKit room connection helper. The interview build (M2) uses this to join the
// SFU room with the token from POST /sessions/:id/join and publish the mic.
import { Room, RoomEvent } from "livekit-client";

// The backend mints the LiveKit signaling URL from its own (docker-internal) vantage
// point — in prod that's `ws://livekit:7880`, which the browser can neither resolve nor
// open (insecure ws:// is blocked as mixed content on our HTTPS page). nginx proxies the
// LiveKit signaling path (`/rtc`) over TLS on the app's own origin, so when we're served
// over HTTPS we point the client at `wss://<our-host>` and let the proxy reach the SFU.
// In dev (http://localhost) the backend's ws://localhost:7880 is reachable as-is. A
// build-time VITE_LIVEKIT_URL wins outright if set.
export function resolveLiveKitUrl(rawUrl: string): string {
  const override = import.meta.env.VITE_LIVEKIT_URL as string | undefined;
  if (override) return override;
  if (window.location.protocol === "https:" && rawUrl.startsWith("ws://")) {
    return `wss://${window.location.host}`;
  }
  return rawUrl;
}

export async function connectToRoom(url: string, token: string): Promise<Room> {
  const room = new Room({ adaptiveStream: true, dynacast: true });
  room.on(RoomEvent.Disconnected, () => console.log("room disconnected"));
  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);
  return room;
}
