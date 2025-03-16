import { RoomService } from "@/app/_services/room-service";

// Add this to the POST handler

// Clean up stale presence data
RoomService.cleanupStalePresence();
