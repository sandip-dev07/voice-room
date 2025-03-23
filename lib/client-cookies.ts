import Cookies from 'js-cookie'

export const LAST_ROOM_COOKIE = 'last_room'
export const LAST_ROOM_NAME_COOKIE = 'last_room_name'

export function getClientLastRoom() {
  const roomId = Cookies.get(LAST_ROOM_COOKIE)
  const roomName = Cookies.get(LAST_ROOM_NAME_COOKIE)

  if (roomId) {
    return {
      id: roomId,
      name: roomName || undefined
    }
  }
  return null
}

export function setClientLastRoom(roomId: string, roomName: string) {
  // Set cookies with 5 days expiration
  const expiresIn = 5
  Cookies.set(LAST_ROOM_COOKIE, roomId, { 
    expires: expiresIn,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  })
  Cookies.set(LAST_ROOM_NAME_COOKIE, roomName, {
    expires: expiresIn,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  })
}

export function removeClientLastRoom() {
  Cookies.remove(LAST_ROOM_COOKIE, { path: '/' })
  Cookies.remove(LAST_ROOM_NAME_COOKIE, { path: '/' })
}