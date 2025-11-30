import React, { useEffect, useRef, useState } from 'react';
import { connectLiveTriageSession } from '../services/geminiService';
import { decodeAudioData, base64ToUint8Array } from '../utils/audioUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceAvatarModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [isTalking, setIsTalking] = useState(false);
  
  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const stopSessionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cleanup = false;

    const startSession = async () => {
      try {
        setStatus('connecting');
        
        // 1. Setup Audio Contexts
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        // 2. Setup Mic Input (16kHz for Gemini input)
        const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        sourceRef.current = inputCtx.createMediaStreamSource(streamRef.current);
        processorRef.current = inputCtx.createScriptProcessor(4096, 1, 1);
        
        // 3. Connect to Live API
        const disconnectSession = await connectLiveTriageSession(
          () => {
             // onOpen
             if (!cleanup) setStatus('connected');
          },
          async (base64Audio) => {
            if (cleanup) return;
            setIsTalking(true);
            
            // Queue audio playback
            if (audioContextRef.current) {
                const ctx = audioContextRef.current;
                const audioData = base64ToUint8Array(base64Audio);
                const buffer = await decodeAudioData(audioData, ctx, 24000, 1);
                
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                
                const currentTime = ctx.currentTime;
                // Ensure we don't schedule in the past
                if (nextStartTimeRef.current < currentTime) {
                    nextStartTimeRef.current = currentTime;
                }
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                
                source.onended = () => {
                    if (ctx.currentTime >= nextStartTimeRef.current - 0.1) {
                        setIsTalking(false);
                    }
                };
            }
          },
          () => {
             if(!cleanup) {
               setStatus('disconnected');
               // Optional: Auto close or show error
             } 
          }
        );
        
        stopSessionRef.current = disconnectSession;
        
      } catch (err) {
        console.error("Failed to start live session", err);
        setStatus('error');
      }
    };

    startSession();

    return () => {
      cleanup = true;
      if (stopSessionRef.current) stopSessionRef.current();
      
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (processorRef.current) processorRef.current.disconnect();
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-2xl p-6 w-[90%] max-w-md shadow-2xl flex flex-col items-center relative overflow-hidden animate-fade-in-up">
        
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800">
          <span className="material-icons">close</span>
        </button>

        <div className="mt-8 mb-6 relative">
          {/* Avatar Ring Status */}
          <div className={`w-36 h-36 rounded-full overflow-hidden border-4 transition-all duration-500 
            ${status === 'connecting' ? 'border-yellow-400' : ''}
            ${status === 'connected' ? 'border-[#00a884] shadow-[0_0_30px_rgba(0,168,132,0.4)]' : ''}
            ${status === 'error' || status === 'disconnected' ? 'border-red-500 grayscale' : ''}
            ${isTalking ? 'scale-105 shadow-[0_0_40px_rgba(0,168,132,0.6)]' : ''}
          `}>
            <img 
              src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=400&fit=crop" 
              alt="Dr. Nex Avatar" 
              className="w-full h-full object-cover"
            />
          </div>

          {/* Status Badge */}
          <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2">
             {status === 'connecting' && (
                <div className="bg-yellow-100 text-yellow-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-2 shadow-sm whitespace-nowrap">
                   <span className="w-2 h-2 bg-yellow-500 rounded-full animate-ping"></span>
                   Conectando...
                </div>
             )}
             {status === 'connected' && (
                <div className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-2 shadow-sm whitespace-nowrap">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                  EN LÍNEA
                </div>
             )}
             {(status === 'error' || status === 'disconnected') && (
                <div className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-2 shadow-sm whitespace-nowrap">
                  <span className="material-icons text-[14px]">error_outline</span>
                  Desconectado
                </div>
             )}
          </div>
        </div>

        <h3 className="text-2xl font-bold text-gray-800 mb-1 mt-4">Dr. Nex</h3>
        <p className="text-gray-500 text-sm mb-8 text-center px-4 h-6">
          {status === 'connecting' && "Estableciendo conexión segura..."}
          {status === 'connected' && (isTalking ? "El Dr. Nex está hablando..." : "Escuchando... puedes hablar.")}
          {status === 'disconnected' && "La conexión se ha cerrado."}
          {status === 'error' && "No se pudo conectar."}
        </p>

        <div className="flex gap-4">
           <button 
             onClick={onClose} 
             className="bg-red-500 hover:bg-red-600 text-white rounded-full p-4 shadow-lg transition-transform hover:scale-105 flex items-center justify-center w-16 h-16"
           >
              <span className="material-icons text-3xl">call_end</span>
           </button>
        </div>
      </div>
    </div>
  );
};