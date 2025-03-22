"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import Peer from "peerjs";

type PeerConnection = {
  peerId: string;
  call: any;
  audio: HTMLAudioElement | null;
  type: "audio";
  connectionQuality: "good" | "fair" | "poor";
};

type RoomParticipant = {
  userId: string;
  peerId: string;
  timestamp: number;
};

export function usePeerVoiceChat(roomId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [networkQuality, setNetworkQuality] = useState<"good" | "fair" | "poor">("good");

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const userIdRef = useRef<string>("");
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const roomPrefixRef = useRef<string>(`voicechat-${roomId}-`);
  const audioElementsCallbackRef = useRef<
    ((id: string, audio: HTMLAudioElement) => void) | null
  >(null);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const participantPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize userId on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUserId = localStorage.getItem(`voicechat-userid-${roomId}`);
      if (!storedUserId) {
        const newUserId = uuidv4().substring(0, 8);
        localStorage.setItem(`voicechat-userid-${roomId}`, newUserId);
        userIdRef.current = newUserId;
      } else {
        userIdRef.current = storedUserId;
      }
    }
  }, [roomId]);

  // Store user ID in localStorage when it's first created
  useEffect(() => {
    if (typeof window !== 'undefined' && userIdRef.current) {
      localStorage.setItem(`voicechat-userid-${roomId}`, userIdRef.current);
    }
  }, [roomId]);

  // Toggle mute function
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !isMuted;
    });

    setIsMuted((prev) => !prev);
  }, [isMuted]);

  // Call a peer
  const callPeer = useCallback((peerId: string, userId: string) => {
    if (!peerRef.current || !localStreamRef.current) return;

    // Don't call if we already have a connection
    if (peersRef.current.has(userId)) return;

    console.log(`Calling peer: ${peerId}`);
    const call = peerRef.current.call(peerId, localStreamRef.current);

    // Handle call stream
    call.on("stream", (remoteStream) => {
      console.log(`Received audio stream from:`, userId);

      // Create audio element
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.muted = false;

      // Try to play immediately
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error("Error playing audio:", err);
          // Try again after a short delay
          setTimeout(() => {
            audio
              .play()
              .catch((e) => console.error("Retry error playing audio:", e));
          }, 1000);
        });
      }

      // Store the peer connection
      peersRef.current.set(userId, {
        peerId,
        call,
        audio,
        type: "audio",
        connectionQuality: "good",
      });

      // Add to participants
      setParticipants((prev) => {
        if (!prev.includes(userId)) {
          return [...prev, userId];
        }
        return prev;
      });

      // Register audio element for volume control
      if (audioElementsCallbackRef.current) {
        audioElementsCallbackRef.current(userId, audio);
      }
    });

    // Handle call close
    call.on("close", () => {
      console.log(`Audio call closed with:`, userId);

      // Clean up audio
      const peer = peersRef.current.get(userId);
      if (peer && peer.audio) {
        peer.audio.srcObject = null;
      }
      peersRef.current.delete(userId);

      // Remove from participants
      setParticipants((prev) => prev.filter((id) => id !== userId));
    });

    // Handle call errors
    call.on("error", (err) => {
      console.error(`Audio call error with`, userId, ":", err);
      setError(`Call error: ${err.message || "Unknown error"}`);
    });
  }, []);

  // Fetch participants from server
  const fetchParticipants = useCallback(async () => {
    if (!peerRef.current) return;

    try {
      const response = await fetch(`/api/rooms/presence?roomId=${roomId}`);
      const data = await response.json();

      if (!data.success) {
        console.error("Failed to fetch participants:", data.error);
        return;
      }

      // Update participants list - filter out duplicates and own ID
      const currentParticipants = data.participants
        .filter((p: RoomParticipant) => p.userId !== userIdRef.current) // Remove own ID
        .filter((p: RoomParticipant, index: number, self: RoomParticipant[]) => 
          index === self.findIndex((t) => t.userId === p.userId) // Remove duplicates
        )
        .map((p: RoomParticipant) => p.userId);

      setParticipants(currentParticipants);

      // Call new participants
      currentParticipants.forEach((participantId: string) => {
        const participant = data.participants.find(
          (p: RoomParticipant) => p.userId === participantId
        );
        if (participant && participant.peerId !== peerRef.current?.id && !peersRef.current.has(participantId)) {
          callPeer(participant.peerId, participantId);
        }
      });
    } catch (error) {
      console.error("Error fetching participants:", error);
    }
  }, [roomId, callPeer]);

  // Start polling for participants
  const startParticipantPolling = useCallback(() => {
    // Initial fetch
    fetchParticipants();

    // Set up interval for polling
    participantPollingIntervalRef.current = setInterval(fetchParticipants, 10000);
  }, [fetchParticipants]);

  // Cleanup function
  const disconnect = useCallback(() => {
    // Remove presence from server
    fetch(`/api/rooms/presence`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomId,
        userId: userIdRef.current,
      }),
    }).catch((err) => console.error("Error removing presence:", err));

    // Clear intervals
    if (presenceIntervalRef.current) {
      clearInterval(presenceIntervalRef.current);
    }
    if (participantPollingIntervalRef.current) {
      clearInterval(participantPollingIntervalRef.current);
    }

    // Close all peer connections
    peersRef.current.forEach((peer) => {
      if (peer.audio) {
        peer.audio.srcObject = null;
      }
      if (peer.call) {
        peer.call.close();
      }
    });
    peersRef.current.clear();

    // Close peer connection
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Remove user ID from localStorage when explicitly disconnecting
    localStorage.removeItem(`voicechat-userid-${roomId}`);

    setIsConnected(false);
    setParticipants([]);
  }, [roomId]);

  // Register callback for audio elements
  const registerAudioElementsCallback = useCallback(
    (callback: (id: string, audio: HTMLAudioElement) => void) => {
      audioElementsCallbackRef.current = callback;
    },
    []
  );

  // Broadcast presence to server
  const broadcastPresence = useCallback(async () => {
    if (!peerRef.current) return;

    try {
      const presenceData = {
        roomId,
        userId: userIdRef.current,
        peerId: `${roomPrefixRef.current}${userIdRef.current}`,
        timestamp: Date.now(),
      };

      // Send presence to server API
      const response = await fetch("/api/rooms/presence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(presenceData),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Error broadcasting presence:", error);
      } else {
        console.log("Presence broadcast to server");
      }
    } catch (error) {
      console.error("Error broadcasting presence:", error);
    }
  }, [roomId]);

  // Monitor network quality
  const monitorNetworkQuality = useCallback(() => {
    if (!peerRef.current) return;

    const checkConnectionQuality = () => {
      const connections = peerRef.current?.connections;
      if (!connections) return;

      let totalQuality = 0;
      let connectionCount = 0;

      Object.values(connections).forEach((conns: any) => {
        conns.forEach((conn: any) => {
          if (conn.open) {
            const stats = conn.getStats();
            stats.forEach((stat: any) => {
              if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                // Calculate quality based on RTT and packet loss
                const rtt = stat.currentRoundTripTime || 0;
                const packetLoss = stat.packetsLost || 0;
                const totalPackets = stat.packetsSent || 1;
                const lossRate = packetLoss / totalPackets;

                let quality = 1;
                if (rtt > 300) quality -= 0.3; // High latency
                if (lossRate > 0.1) quality -= 0.3; // High packet loss
                if (rtt > 500) quality -= 0.4; // Very high latency
                if (lossRate > 0.2) quality -= 0.4; // Very high packet loss

                totalQuality += Math.max(0, quality);
                connectionCount++;
              }
            });
          }
        });
      });

      if (connectionCount > 0) {
        const averageQuality = totalQuality / connectionCount;
        const newQuality = averageQuality > 0.7 ? "good" : averageQuality > 0.4 ? "fair" : "poor";
        setNetworkQuality(newQuality);
        
        // Adjust audio quality based on network conditions
        if (localStreamRef.current) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          if (audioTrack) {
            const constraints = audioTrack.getConstraints();
            if (newQuality === "poor") {
              // Reduce quality for poor connections
              audioTrack.applyConstraints({
                ...constraints,
                sampleRate: 22050,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false
              });
            } else if (newQuality === "fair") {
              // Medium quality for fair connections
              audioTrack.applyConstraints({
                ...constraints,
                sampleRate: 32000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              });
            } else {
              // High quality for good connections
              audioTrack.applyConstraints({
                ...constraints,
                sampleRate: 48000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              });
            }
          }
        }
      }
    };

    // Check quality every 5 seconds
    const qualityInterval = setInterval(checkConnectionQuality, 5000);
    return () => clearInterval(qualityInterval);
  }, []);

  // Initialize PeerJS and WebRTC connections
  useEffect(() => {
    let mounted = true;

    const initializeVoiceChat = async () => {
      try {
        setIsLoading(true);

        // Get local audio stream with initial low quality settings for better initial connection
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 22050, // Start with lower quality
            channelCount: 1,
          },
          video: false,
        });

        if (!mounted) return;
        
        // Set initial mute state
        stream.getAudioTracks().forEach(track => {
          track.enabled = !isMuted;
        });
        
        localStreamRef.current = stream;

        // Create a unique peer ID for this user in this room
        const peerId = `${roomPrefixRef.current}${userIdRef.current}`;

        // Initialize PeerJS
        const peer = new Peer(peerId, {
          debug: 3, // Increase debug level for more verbose logging
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.google.com:19302" },
              { urls: "stun:stun2.google.com:19302" },
              // Add TURN servers for better NAT traversal
              {
                urls: "turn:global.turn.twilio.com:3478?transport=udp",
                username:
                  "f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d",
                credential: "w1WpauEsFbEK+oFkxC/mEZ48bQlPwjnl1xoQgkA0vTw=",
              },
            ],
            sdpSemantics: "unified-plan",
          },
        });

        peerRef.current = peer;

        // Handle peer open event
        peer.on("open", async (id) => {
          console.log("Connected to PeerJS server with ID:", id);
          setIsConnected(true);
          setIsLoading(false);

          // Announce presence to other peers via server
          await broadcastPresence();

          // Start polling for participants
          startParticipantPolling();

          // Start network quality monitoring
          const cleanupQualityMonitor = monitorNetworkQuality();
        });

        // Handle incoming calls
        peer.on("call", (call) => {
          console.log(
            "Received call from:",
            call.peer,
            "with metadata:",
            call.metadata
          );

          // Answer with our audio stream
          console.log("Answering audio call with local stream");
          call.answer(localStreamRef.current!);

          // Extract the user ID from the peer ID
          let callerId = call.peer.replace(roomPrefixRef.current, "");

          // Handle incoming stream
          call.on("stream", (remoteStream) => {
            console.log(`Received audio stream from:`, callerId);

            // Handle incoming audio
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.autoplay = true;
            audio.setAttribute("playsinline", "true");
            audio.muted = false;

            // Try to play immediately
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.catch((err) => {
                console.error("Error playing audio:", err);
                // Try again after a short delay
                setTimeout(() => {
                  audio
                    .play()
                    .catch((e) =>
                      console.error("Retry error playing audio:", e)
                    );
                }, 1000);
              });
            }

            // Store the peer connection
            peersRef.current.set(callerId, {
              peerId: call.peer,
              call,
              audio,
              type: "audio",
              connectionQuality: "good",
            });

            // Add to participants
            setParticipants((prev) => {
              if (!prev.includes(callerId)) {
                return [...prev, callerId];
              }
              return prev;
            });

            // Register audio element for volume control
            if (audioElementsCallbackRef.current) {
              audioElementsCallbackRef.current(callerId, audio);
            }
          });

          // Handle call close
          call.on("close", () => {
            console.log(`Audio call closed with:`, callerId);

            // Clean up audio
            const peer = peersRef.current.get(callerId);
            if (peer && peer.audio) {
              peer.audio.srcObject = null;
            }
            peersRef.current.delete(callerId);

            // Remove from participants
            setParticipants((prev) => prev.filter((id) => id !== callerId));
          });

          // Handle call errors
          call.on("error", (err) => {
            console.error(`Audio call error with`, callerId, ":", err);
            setError(`Call error: ${err.message || "Unknown error"}`);
          });
        });

        // Handle peer errors
        peer.on("error", (err) => {
          console.error("Peer error:", err);
          setError(`Connection error: ${err.message || "Unknown error"}`);
          setIsLoading(false);
        });

        // Handle peer disconnection
        peer.on("disconnected", () => {
          console.log("Disconnected from PeerJS server");
          setIsConnected(false);

          // Try to reconnect
          peer.reconnect();
        });

        // Handle peer close
        peer.on("close", () => {
          console.log("PeerJS connection closed");
          setIsConnected(false);
        });
      } catch (err) {
        console.error("Error initializing voice chat:", err);
        setError(
          `Failed to initialize voice chat: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        setIsLoading(false);
      }
    };

    // Start the voice chat
    initializeVoiceChat();

    // Periodically broadcast presence to server
    presenceIntervalRef.current = setInterval(broadcastPresence, 60000);

    return () => {
      mounted = false;

      // Clean up
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
      }

      if (participantPollingIntervalRef.current) {
        clearInterval(participantPollingIntervalRef.current);
      }

      // Remove presence from server
      fetch(`/api/rooms/presence`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId,
          userId: userIdRef.current,
        }),
      }).catch((err) => console.error("Error removing presence:", err));

      // Close PeerJS connection
      if (peerRef.current) {
        peerRef.current.destroy();
      }

      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Close all peer connections
      peersRef.current.forEach((peer) => {
        if (peer.call) {
          peer.call.close();
        }
        if (peer.audio) {
          peer.audio.srcObject = null;
        }
      });

      peersRef.current.clear();

      // Stop network quality monitoring
      const cleanupQualityMonitor = monitorNetworkQuality();
    };
  }, [roomId, broadcastPresence, startParticipantPolling, monitorNetworkQuality]);

  // Handle mute/unmute
  useEffect(() => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getAudioTracks();
      tracks.forEach((track) => {
        const wasEnabled = track.enabled;
        track.enabled = !isMuted;
        console.log(
          `Audio track ${track.id} changed from ${wasEnabled} to ${!isMuted}`
        );
      });

      if (tracks.length === 0) {
        console.warn("No audio tracks found in local stream");
      }
    } else {
      console.warn("Local stream not available for mute/unmute");
    }
  }, [isMuted]);

  return {
    isConnected,
    isMuted,
    error,
    participants,
    userId: userIdRef.current,
    toggleMute,
    disconnect,
    isLoading,
    registerAudioElementsCallback,
    networkQuality,
  };
}
