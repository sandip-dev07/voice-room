import { prisma } from "@/lib/prisma"

export class RoomService {
  /**
   * Clean up stale presence data
   */
  static async cleanupStalePresence() {
    try {
      const result = await prisma.roomPresence.deleteMany({
        where: {
          timestamp: { lt: new Date(Date.now() - 120000) }, // Older than 2 minutes
        },
      })

      return { success: true, deletedCount: result.count }
    } catch (error) {
      console.error("Error cleaning up stale presence:", error)
      throw error
    }
  }
}

