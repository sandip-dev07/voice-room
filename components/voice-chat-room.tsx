"use client";

import { useState, useEffect, useRef } from "react";
import { usePeerVoiceChat } from "@/hooks/use-peer-voice-chat";
import { Avatar } from "@/components/ui/avatar";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RefreshCw,
  Settings,
  Copy,
  LogOut,
  Loader,
  Check,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

interface VoiceChatRoomProps {
  roomId: string;
}

export default function VoiceChatRoom({ roomId }: VoiceChatRoomProps) {
  const {
    isConnected,
    isMuted,
    error,
    participants,
    userId,
    toggleMute,
    disconnect,
    isLoading,
    registerAudioElementsCallback,
  } = usePeerVoiceChat(roomId);

  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [volume] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const router = useRouter();

  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Check microphone permission
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(() => setPermissionGranted(true))
      .catch(() => setPermissionGranted(false));
  }, []);

  // Handle speaker mute/unmute
  useEffect(() => {
    const audioElements = Array.from(audioElementsRef.current.values());

    audioElements.forEach((audio) => {
      if (audio) {
        audio.muted = speakerMuted;
        audio.volume = volume;

        if (speakerMuted) {
          audio.pause();
        } else {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((e) => console.error("Audio play error:", e));
          }
        }
      }
    });
  }, [speakerMuted, volume]);

  // Register callback for audio elements
  useEffect(() => {
    if (isConnected) {
      const handleAudioElement = (id: string, audio: HTMLAudioElement) => {
        audioElementsRef.current.set(id, audio);
        audio.muted = speakerMuted;
        audio.volume = volume;
      };

      registerAudioElementsCallback(handleAudioElement);
    }
  }, [isConnected, registerAudioElementsCallback, speakerMuted, volume]);

  // Setup audio visualization for speaking detection
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
          audio: true,
        });

        // Create audio context
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        dataArrayRef.current = dataArray;

        // Start visualization loop
        const checkAudioLevel = () => {
          if (!analyserRef.current || !dataArrayRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArrayRef.current);

          // Calculate average volume
          const average =
            dataArrayRef.current.reduce((sum, value) => sum + value, 0) /
            dataArrayRef.current.length;

          // Set speaking state based on threshold
          setIsSpeaking(average > 20);

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

  // Generate initials from user ID
  const getInitials = (id: string) => {
    return id.substring(0, 2).toUpperCase();
  };

  if (permissionGranted === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#121212] text-white p-4">
        <div className="w-full max-w-md bg-[#1e1e1e] rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-center">
            Microphone Access Required
          </h2>
          <p className="text-gray-300 mb-6 text-center">
            Please allow microphone access to use the voice chat feature.
          </p>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then(() => setPermissionGranted(true))
                .catch(() => setPermissionGranted(false));
            }}
          >
            Request Access
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#121212] text-white p-4">
      <div className="max-w-md w-full mx-auto flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2">
            <div className="text-sm text-gray-400">
              Room: <span className="text-gray-200">{roomId}</span>
            </div>
            <Button size={"sm"} variant="ghost" onClick={copyRoomLink}>
              {copied ? <Check size={8} /> : <Copy size={8} />}
            </Button>
          </div>
          <div className="flex space-x-4">
            <button className="text-gray-400 hover:text-white">
              <RefreshCw size={18} onClick={() => window.location.reload()} />
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold mb-2">Voice Chat</h1>
          {isLoading ? (
            <div className="inline-flex items-center px-2 py-1 rounded-full bg-[#3a3a3a] text-xs">
              <div className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></div>
              Connecting...
            </div>
          ) : isConnected ? (
            <div className="inline-flex items-center px-2 py-1 rounded-full bg-[#3a3a3a] text-xs">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
              Connected
            </div>
          ) : (
            <div className="inline-flex items-center px-2 py-1 rounded-full bg-[#3a3a3a] text-xs">
              <div className="w-2 h-2 bg-red-400 rounded-full mr-2"></div>
              Disconnected
            </div>
          )}
        </div>

        {/* Participants */}
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-md font-medium">Participants</h2>
          <div className="bg-[#3a3a3a] rounded-full w-5 h-5 flex items-center justify-center text-xs">
            {participants.length + 1}
          </div>
        </div>

        {/* Participant List */}
        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {/* Current User */}
          <div className="bg-[#1e1e1e] rounded-xl p-3">
            <div className="flex items-center">
              <div className="relative">
                <Avatar className="h-12 w-12 bg-[#3a3a3a] text-white flex items-center justify-center border-2 border-[#1e1e1e]">
                  <div>{getInitials(userId)}</div>
                </Avatar>
                {isSpeaking && !isMuted && (
                  <div className="absolute bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1e1e1e]"></div>
                )}
              </div>
              <div className="ml-3 flex-1">
                <div className="">{userId} (You)</div>
                <div className="text-sm text-gray-400">
                  {isSpeaking && !isMuted ? "Speaking" : "Not speaking"}
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  className={`p-2 rounded-full ${
                    speakerMuted
                      ? "bg-red-900/30 text-red-500"
                      : "text-gray-400 hover:text-white"
                  }`}
                  onClick={toggleSpeakerMute}
                >
                  {speakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <button
                  className={`p-2 rounded-full ${
                    isMuted
                      ? "bg-red-900/30 text-red-500"
                      : "text-gray-400 hover:text-white"
                  }`}
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* Other Participants */}
          {participants.map((participantId) => (
            <div key={participantId} className="bg-[#1e1e1e] rounded-lg p-3">
              <div className="flex items-center">
                <div className="relative">
                  <Avatar className="h-12 w-12 bg-[#3a3a3a] text-white flex items-center justify-center border-2 border-[#1e1e1e]">
                    <div>{getInitials(participantId)}</div>
                  </Avatar>
                </div>
                <div className="ml-3 flex-1">
                  <div className="font-medium">{participantId}</div>
                  <div className="text-sm text-gray-400">Connected</div>
                </div>
              </div>
            </div>
          ))}

          {/* Empty State */}
          {participants.length === 0 && !isLoading && (
            <div className="bg-[#1e1e1e] rounded-xl p-6 text-center text-gray-400">
              <p className="text-sm">No other participants yet.</p>
              <p className="text-sm">Share the room link to invite others.</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && participants.length === 0 && (
            <div className="bg-[#1e1e1e] rounded-xl p-6 py-5 text-center text-gray-400">
              <Loader className="h-4 w-4 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Looking for participants...</p>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-4">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Bottom Controls */}
        <Button
          variant="destructive"
          className="w-full rounded-lg overflow-hidden"
          onClick={() => {
            disconnect();
            router.push("/");
          }}
        >
          <LogOut size={16} />
          <span>Leave Room</span>
        </Button>
      </div>
    </div>
  );
}
