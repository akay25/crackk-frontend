// LiveKit room connection helper. The interview build (M2) uses this to join the
// SFU room with the token from POST /sessions/:id/join and publish the mic.
import { Room, RoomEvent } from "livekit-client";

// The backend mints the LiveKit signaling URL and returns it from POST /sessions/:id/join.
// In prod it should hand back the public TLS endpoint (e.g. `wss://livekit.crackk.ai`); in
// dev it's `ws://localhost:7880`. We trust whatever the backend sends and connect directly.
// A build-time VITE_LIVEKIT_URL wins outright if set, as an escape hatch.
export function resolveLiveKitUrl(rawUrl: string): string {
  const override = import.meta.env.VITE_LIVEKIT_URL as string | undefined;
  if (override) return override;
  return rawUrl;
}

export async function connectToRoom(url: string, token: string): Promise<Room> {
  const room = new Room({ adaptiveStream: true, dynacast: true });
  room.on(RoomEvent.Disconnected, () => console.log("room disconnected"));
  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);
  return room;
}
