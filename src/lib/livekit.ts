// LiveKit room connection helper. The interview build (M2) uses this to join the
// SFU room with the token from POST /sessions/:id/join and publish the mic.
import { Room, RoomEvent } from "livekit-client";

export async function connectToRoom(url: string, token: string): Promise<Room> {
  const room = new Room({ adaptiveStream: true, dynacast: true });
  room.on(RoomEvent.Disconnected, () => console.log("room disconnected"));
  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);
  return room;
}
