import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"

export default function RoomNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white p-4">
      <div className="w-full max-w-md bg-[#1e1e1e] rounded-lg p-6 shadow-lg text-center">
        <h1 className="text-2xl font-bold mb-4">Room Not Found</h1>
        <p className="text-gray-400 mb-6">The room you&apos;re looking for doesn&apos;t exist or has expired.</p>
        <Link href="/">
          <Button className="bg-green-600 hover:bg-green-700 text-white inline-flex items-center">
            <Home className="mr-2 h-4 w-4" />
            Return Home
          </Button>
        </Link>
      </div>
    </div>
  )
}

