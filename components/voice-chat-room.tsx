"use client";

import { useState, useEffect, useRef } from "react";
import { usePeerVoiceChat } from "@/hooks/use-peer-voice-chat";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RefreshCw,
  Copy,
  LogOut,
  Check,
  Monitor,
  MonitorOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface VoiceChatRoomProps {
  roomId: string;
}

export default function VoiceChatRoom({ roomId }: VoiceChatRoomProps) {
  const {
    isConnected,
    isMuted,
    participants,
    userId,
    toggleMute,
    disconnect,
    isLoading,
    registerAudioElementsCallback,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    activeScreenShare,
  } = usePeerVoiceChat(roomId);

  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [volume] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingStates, setSpeakingStates] = useState<{
    [key: string]: boolean;
  }>({});
  const [userName, setUserName] = useState<string>("");
  const router = useRouter();

  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Add screen share video ref
  const screenShareVideoRef = useRef<HTMLVideoElement>(null);

  // Get user's name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem(`userName_${roomId}`);
    if (savedName && savedName !== "skipped") {
      setUserName(savedName);
    } else {
      setUserName(userId);
    }
  }, [roomId, userId]);

  // Check microphone permission
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(() => setPermissionGranted(true))
      .catch(() => setPermissionGranted(false));
  }, []);

  // Handle speaker mute/unmute with improved audio handling
  useEffect(() => {
    const audioElements = Array.from(audioElementsRef.current.values());

    audioElements.forEach((audio) => {
      if (audio) {
        audio.muted = speakerMuted;
        audio.volume = volume;

        if (!speakerMuted) {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(async (error) => {
              console.error("Audio play error:", error);
              try {
                // Try to resume audio context if it was suspended
                if (audioContextRef.current?.state === "suspended") {
                  await audioContextRef.current.resume();
                }
                // Retry playing after a short delay
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await audio.play();
              } catch (e) {
                console.error("Retry error playing audio:", e);
              }
            });
          }
        }
      }
    });
  }, [speakerMuted, volume]);

  // Register callback for audio elements with improved handling
  useEffect(() => {
    if (isConnected) {
      const handleAudioElement = (id: string, audio: HTMLAudioElement) => {
        audioElementsRef.current.set(id, audio);
        audio.muted = speakerMuted;
        audio.volume = volume;

        // Set up speaking detection for other participants with improved audio analysis
        if (id !== userId) {
          const audioContext = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
          const analyser = audioContext.createAnalyser();
          const source = audioContext.createMediaStreamSource(
            audio.srcObject as MediaStream
          );

          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          analyser.minDecibels = -90;
          analyser.maxDecibels = -10;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let silenceCount = 0;

          const checkAudioLevel = () => {
            analyser.getByteFrequencyData(dataArray);
            const average =
              dataArray.reduce((sum, value) => sum + value, 0) /
              dataArray.length;

            // More sophisticated speaking detection
            if (average > 20) {
              silenceCount = 0;
              setSpeakingStates((prev) => ({
                ...prev,
                [id]: true,
              }));
            } else {
              silenceCount++;
              if (silenceCount > 5) {
                setSpeakingStates((prev) => ({
                  ...prev,
                  [id]: false,
                }));
              }
            }

            requestAnimationFrame(checkAudioLevel);
          };

          checkAudioLevel();
        }

        if (!speakerMuted) {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(async (error) => {
              console.error("Audio play error:", error);
              try {
                // Try to resume audio context if it was suspended
                if (audioContextRef.current?.state === "suspended") {
                  await audioContextRef.current.resume();
                }
                // Retry playing after a short delay
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await audio.play();
              } catch (e) {
                console.error("Retry error playing audio:", e);
              }
            });
          }
        }
      };

      registerAudioElementsCallback(handleAudioElement);
    }
  }, [
    isConnected,
    registerAudioElementsCallback,
    speakerMuted,
    volume,
    userId,
  ]);

  // Set up audio visualization for current user with improved analysis
  useEffect(() => {
    if (!isConnected || isMuted) {
      setIsSpeaking(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const setupAudioVisualization = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          },
        });

        // Create audio context with improved settings
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let silenceCount = 0;

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        dataArrayRef.current = dataArray;

        // Start visualization loop with improved analysis
        const checkAudioLevel = () => {
          if (!analyserRef.current || !dataArrayRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArrayRef.current);

          // Calculate average volume with improved threshold
          const average =
            dataArrayRef.current.reduce((sum, value) => sum + value, 0) /
            dataArrayRef.current.length;

          // More sophisticated speaking detection
          if (average > 20) {
            silenceCount = 0;
            setIsSpeaking(true);
          } else {
            silenceCount++;
            if (silenceCount > 5) {
              setIsSpeaking(false);
            }
          }

          // Continue loop
          animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
        };

        checkAudioLevel();
      } catch (error) {
        console.error("Error setting up audio visualization:", error);
      }
    };

    setupAudioVisualization();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [isConnected, isMuted]);

  // Handle screen share video
  useEffect(() => {
    if (activeScreenShare && screenShareVideoRef.current) {
      const video = screenShareVideoRef.current;
      video.srcObject = activeScreenShare.stream;
      video.play().catch(console.error);
    }
  }, [activeScreenShare]);

  const copyRoomLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleSpeakerMute = () => {
    setSpeakerMuted((prev) => !prev);
  };

  // Generate initials from name or user ID
  const getInitials = (id: string, name?: string) => {
    if (name) {
      return name.substring(0, 2).toUpperCase();
    }
    return id.substring(0, 2).toUpperCase();
  };

  // Generate avatar URL from user ID or name
  const getAvatarUrl = (id: string, name?: string) => {
    const seed = name || id;
    // Use avatar.vercel.sh to generate avatar
    return `https://avatar.vercel.sh/${encodeURIComponent(seed)}?size=80`;
  };

  // Filter out duplicate participants and own user ID
  const uniqueParticipants = participants.filter(
    (participantId, index, self) => {
      return self.indexOf(participantId) === index && participantId !== userId;
    }
  );

  if (permissionGranted === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-[#121212] to-[#1a1a1a] text-white p-6">
        <div className="w-full max-w-md bg-[#1e1e1e]/90 backdrop-blur-md rounded-xl p-8 shadow-2xl border border-green-900/30">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-green-500/20 p-4 rounded-full">
              <MicOff size={15} className="text-green-400" />
            </div>
          </div>
          <h2 className="text-xl font-bold mb-4 text-center bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
            Microphone Access Required
          </h2>
          <p className="text-gray-300 text-sm mb-8 text-center">
            To join the voice chat, please allow microphone access in your
            browser settings.
          </p>
          <Button
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium py-2 rounded-lg shadow-lg transition-all duration-300"
            onClick={() => {
              navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then(() => setPermissionGranted(true))
                .catch(() => setPermissionGranted(false));
            }}
          >
            Request Microphone Access
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-[#121212] to-[#1a1a1a] text-white p-3">
      <div className="max-w-md w-full mx-auto flex flex-col h-full relative">
        {/* Header with App Logo */}
        <div className="flex justify-between items-center mb-8 bg-[#1e1e1e]/80 backdrop-blur-sm rounded-xl p-3 shadow-md border border-green-900/20">
          <div className="flex items-center space-x-3">
            <Avatar
              className={cn(
                "h-7 w-7 rounded-[7px] shadow-md transition-all duration-300 overflow-hidden"
              )}
            >
              <AvatarImage src={"/logo.jpg"} alt={""} />
              <AvatarFallback className="h-8 w-8 rounded-[7px] bg-background">
                {getInitials("1", "M")}
              </AvatarFallback>
            </Avatar>

            {/* Room ID and Copy Button */}
            <div className="flex items-center space-x-2">
              <div className="text-xs font-medium">
                <span className="text-gray-400 mr-1">Room:</span>
                <span className="text-gray-200">{roomId}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyRoomLink}
                className="rounded-full h-6 w-6 p-0 flex items-center justify-center hover:bg-gray-700/50"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </Button>
            </div>
          </div>

          {/* Refresh Button */}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full h-7 w-7 p-0 flex items-center justify-center hover:bg-gray-700/50"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={14} />
          </Button>
        </div>

        {/* Title */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            Voice Chat
          </h1>
          {isLoading ? (
            <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#2a2a2a] text-xs font-medium shadow-inner">
              <div className="w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-pulse"></div>
              Connecting...
            </div>
          ) : isConnected ? (
            <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#2a2a2a] text-xs font-medium shadow-inner">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
              Connected
            </div>
          ) : (
            <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#2a2a2a] text-xs font-medium shadow-inner">
              <div className="w-2 h-2 bg-red-400 rounded-full mr-2"></div>
              Disconnected
            </div>
          )}
        </div>

        {/* Screen Share View */}
        {activeScreenShare && (
          <div className="mb-4 bg-[#1e1e1e]/80 backdrop-blur-sm rounded-xl p-3 shadow-md border border-green-900/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Monitor size={16} className="text-green-400" />
                <span className="text-sm font-medium">
                  {localStorage.getItem(
                    `userName_${roomId}_${activeScreenShare.userId}`
                  ) || activeScreenShare.userId}{" "}
                  is sharing their screen
                </span>
              </div>
              {activeScreenShare.userId === userId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full h-6 w-6 p-0 flex items-center justify-center hover:bg-red-500/20 text-gray-400 hover:text-red-400"
                  onClick={stopScreenShare}
                >
                  <MonitorOff size={14} />
                </Button>
              )}
              {/* {} */}
            </div>
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
              <video
                ref={screenShareVideoRef}
                className="w-full h-full object-contain"
                playsInline
                autoPlay
              />
            </div>
          </div>
        )}

        {/* Participants */}
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-200">Participants</h2>
          <span className="text-xs font-medium text-white bg-green-600/80 rounded-full px-2 py-0.5 min-w-[20px] flex items-center justify-center">
            {uniqueParticipants.length + 1}
          </span>
        </div>

        <div className="space-y-2 flex-grow max-h-screen h-full overflow-y-auto border border-green-900/20 rounded-[12px] p-2">
          {/* Current user */}
          <div className="flex items-center justify-between bg-[#1e1e1e]/80 rounded-xl p-4 mb-3 border border-gray-800 shadow-md transition-all duration-300 hover:bg-[#252525]/80">
            <div className="flex items-center space-x-3">
              <Avatar
                className={cn(
                  "h-9 w-9 shadow-md transition-all duration-300 overflow-hidden",
                  isSpeaking &&
                    "ring-2 ring-green-500 ring-offset-1 ring-offset-[#1a1a1a]"
                )}
              >
                <AvatarImage
                  src={getAvatarUrl(userId, userName)}
                  alt={userName || userId}
                />
                <AvatarFallback className="bg-gradient-to-br from-green-500 to-emerald-600">
                  {getInitials(userId, userName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-sm font-medium">
                  {userName || userId}{" "}
                  <span className="text-xs bg-green-500/30 text-green-200 px-1.5 py-0.5 rounded-full ml-1">
                    You
                  </span>
                </div>
                <div className="text-xs text-gray-400 flex items-center">
                  {isSpeaking ? (
                    <>
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></span>
                      Speaking
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full mr-1.5"></span>
                      Silent
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-full h-8 w-8 p-0 flex items-center justify-center hover:bg-gray-700/50",
                  isMuted
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300"
                    : "bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:text-green-300"
                )}
                onClick={toggleMute}
              >
                {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </Button>
            </div>
          </div>

          {/* Other participants */}
          {uniqueParticipants.map((participantId) => {
            const participantName = localStorage.getItem(
              `userName_${roomId}_${participantId}`
            );
            return (
              <div
                key={participantId}
                className="flex items-center justify-between bg-[#1e1e1e]/80 rounded-xl p-4 mb-3 border border-gray-800 shadow-md transition-all duration-300 hover:bg-[#252525]/80"
              >
                <div className="flex items-center space-x-3">
                  <Avatar
                    className={cn(
                      "h-9 w-9 shadow-md transition-all duration-300 overflow-hidden",
                      speakingStates[participantId] &&
                        "ring-2 ring-green-500 ring-offset-1 ring-offset-[#1a1a1a]"
                    )}
                  >
                    <AvatarImage
                      src={getAvatarUrl(
                        participantId,
                        participantName || undefined
                      )}
                      alt={participantName || participantId}
                    />
                    <AvatarFallback className="bg-gradient-to-br from-gray-600 to-gray-800">
                      {getInitials(participantId, participantName || undefined)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">
                      {participantName || participantId}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center">
                      {speakingStates[participantId] ? (
                        <>
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></span>
                          Speaking
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 bg-gray-500 rounded-full mr-1.5"></span>
                          Silent
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                  Connected
                </div>
              </div>
            );
          })}
        </div>

        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1e1e1e]/70 backdrop-blur-md rounded-full border border-green-900/30 overflow-hidden shadow-xl flex items-center justify-center">
          <div className="flex items-center p-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-full h-10 w-10 p-0 mx-1 flex items-center justify-center hover:bg-gray-700/50",
                speakerMuted &&
                  "bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300"
              )}
              onClick={toggleSpeakerMute}
            >
              {speakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-full h-10 w-10 p-0 mx-1 flex items-center justify-center hover:bg-gray-700/50",
                isMuted
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300"
                  : "bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:text-green-300"
              )}
              onClick={toggleMute}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-full h-10 w-10 p-0 mx-1 flex items-center justify-center hover:bg-gray-700/50",
                isScreenSharing &&
                  "bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:text-green-300"
              )}
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            >
              {isScreenSharing ? (
                <MonitorOff size={18} />
              ) : (
                <Monitor size={18} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full h-10 w-10 p-0 mx-1 flex items-center justify-center hover:bg-red-500/20 text-gray-400 hover:text-red-400"
              onClick={() => {
                disconnect();
                router.push("/");
              }}
            >
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
