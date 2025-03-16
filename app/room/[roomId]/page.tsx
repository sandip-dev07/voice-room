import { Suspense } from "react";
import { notFound } from "next/navigation";
import VoiceChatRoom from "@/components/voice-chat-room";
import prisma from "@/lib/prisma";

interface RoomPageProps {
  params: {
    roomId: string;
  };
}

// Validate room server-side
async function validateRoom(roomId: string) {
  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
    });

    if (!room) {
      return { valid: false, reason: "not_found" };
    }

    if (new Date() > room.expiresAt) {
      return { valid: false, reason: "expired" };
    }

    if (!room.active) {
      return { valid: false, reason: "inactive" };
    }

    return { valid: true, room };
  } catch (error) {
    console.error("Error validating room:", error);
    return { valid: false, reason: "error" };
  }
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = params;

  // Validate room
  const { valid, reason } = await validateRoom(roomId);

  // If room is not valid, show 404
  if (!valid) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#121212]">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center h-screen bg-[#121212] text-white p-4">
            <div className="w-full max-w-md">
              <div className="h-6 bg-[#1e1e1e] rounded mb-4 w-1/2 mx-auto animate-pulse"></div>
              <div className="h-4 bg-[#1e1e1e] rounded mb-8 w-3/4 mx-auto animate-pulse"></div>
              <div className="space-y-4">
                <div className="h-20 bg-[#1e1e1e] rounded animate-pulse"></div>
                <div className="h-20 bg-[#1e1e1e] rounded animate-pulse"></div>
              </div>
            </div>
          </div>
        }
      >
        <VoiceChatRoom roomId={roomId} />
      </Suspense>
    </main>
  );
}
