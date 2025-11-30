import React, { useRef, useEffect } from 'react';
import { Message } from '../types';

interface ChatAreaProps {
  messages: Message[];
  inputRaw: string;
  setInputRaw: (val: string) => void;
  onSend: () => void;
  onMicClick: () => void;
  isRecording: boolean;
  isTyping: boolean;
}

// Helper to format text with Bold and Lists
const formatMessageText = (text: string) => {
  if (!text) return null;

  return text.split('\n').map((line, i) => {
    // 1. Clean weird artifacts: "* **Title**" should be just "**Title**" but rendered as list
    let cleanLine = line.trim();
    const isList = /^[\*\-]\s+/.test(cleanLine);
    
    // Remove list marker if present
    if (isList) {
      cleanLine = cleanLine.replace(/^[\*\-]\s+/, '');
    }

    // Handle empty lines (paragraph breaks)
    if (!cleanLine && !isList) {
      return <div key={i} className="h-3" />;
    }

    // Parse Bold (**text**)
    // Split logic: "A **B** C" -> ["A ", "B", " C"]
    const parts = cleanLine.split(/\*\*(.*?)\*\*/g);

    return (
      <div key={i} className={`flex flex-wrap items-start text-[15px] leading-relaxed ${isList ? 'pl-2 mb-1' : 'mb-0.5'}`}>
        {isList && (
          <span className="mr-2 text-gray-500 font-bold self-start mt-[3px]">•</span>
        )}
        <span className="flex-1 break-words">
          {parts.map((part, index) => {
            // Odd indices match the capture group inside **...**
            if (index % 2 === 1) {
              return <strong key={index} className="font-bold text-gray-900">{part}</strong>;
            }
            return <span key={index}>{part}</span>;
          })}
        </span>
      </div>
    );
  });
};

export const ChatArea: React.FC<ChatAreaProps> = ({ 
  messages, 
  inputRaw, 
  setInputRaw, 
  onSend, 
  onMicClick, 
  isRecording,
  isTyping
}) => {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);
  
  // Focus input when recording stops or component mounts
  useEffect(() => {
    if (!isRecording && inputRef.current) {
        inputRef.current.focus();
    }
  }, [isRecording]);

  return (
    <>
      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-4">
        <div className="text-center my-4">
           <span className="bg-[#fff5c4] text-gray-800 text-[11px] px-2 py-1 rounded shadow-sm border border-black/5">
             🔒 Los mensajes están cifrados de extremo a extremo.
           </span>
        </div>
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`relative max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]
                ${msg.sender === 'user' 
                  ? 'bg-[#E7FFDB] rounded-tr-none' 
                  : 'bg-white rounded-tl-none'
                }`}
            >
              {/* Message Text */}
              <div className="text-[#111b21] pb-3 min-w-[60px]">
                {formatMessageText(msg.text)}
                
                {/* Map Links Grounding */}
                {msg.metadata?.mapLinks && msg.metadata.mapLinks.length > 0 && (
                   <div className="mt-2 pt-2 border-t border-black/5 bg-[#f5f5f5] -mx-3 -mb-1.5 px-3 pb-2 rounded-b-lg">
                      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">📍 Lugares cercanos:</p>
                      {msg.metadata.mapLinks.map((link, idx) => {
                         // Construct direct search link if specific URI is missing
                         const safeUrl = link.uri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(link.title)}`;
                         
                         return (
                           <a 
                             key={idx} 
                             href={safeUrl} 
                             target="_blank" 
                             rel="noreferrer"
                             className="flex items-start gap-2 text-[#00a884] hover:bg-gray-100 p-1.5 rounded transition-colors mb-1 text-[15px] font-medium leading-tight group"
                           >
                             <span className="text-xl shrink-0 group-hover:scale-110 transition-transform">📍</span>
                             <span className="self-center underline decoration-transparent group-hover:decoration-current underline-offset-2 break-all">
                               {link.title}
                             </span>
                             <span className="material-icons text-sm text-gray-400 ml-auto self-center">open_in_new</span>
                           </a>
                         );
                      })}
                   </div>
                )}
              </div>

              {/* Timestamp & Status */}
              <div className="absolute bottom-1 right-2 flex items-center gap-1">
                <span className="text-[10px] text-gray-500/80">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {msg.sender === 'user' && (
                  <span className="material-icons text-[14px] text-[#53bdeb]">done_all</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
             <div className="bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm flex gap-1 items-center">
                <span className="text-xs text-gray-400 mr-2">Escribiendo...</span>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
             </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Bar - Mobile Layout */}
      <div className="bg-transparent px-2 py-2 flex items-end gap-2 min-h-[50px] mb-1">
        
        {/* Main Input Capsule */}
        <div className={`flex-1 bg-white rounded-3xl flex items-center shadow-sm px-4 py-1 min-h-[45px] transition-all ${isRecording ? 'ring-2 ring-red-500/50' : ''}`}>
           {/* Text Input */}
           <input 
             ref={inputRef}
             type="text" 
             value={inputRaw}
             onChange={(e) => setInputRaw(e.target.value)}
             onKeyDown={(e) => e.key === 'Enter' && onSend()}
             placeholder={isRecording ? "Escuchando... (puedes escribir)" : "Mensaje"}
             className="flex-1 bg-transparent border-none outline-none text-[#111b21] text-base placeholder:text-gray-500 h-full"
             autoFocus
           />
        </div>

        {/* Send / Mic Button (External Circle) */}
        <button 
          onClick={isRecording ? onMicClick : (inputRaw.trim() ? onSend : onMicClick)}
          className={`w-12 h-12 flex items-center justify-center rounded-full shadow-md text-white transition-all
            ${isRecording 
               ? 'bg-red-500 animate-pulse' 
               : 'bg-[#00a884] hover:bg-[#008f6f]'
            }`}
        >
          <span className="material-icons text-2xl">
            {isRecording ? 'stop' : (inputRaw.trim() ? 'send' : 'mic')}
          </span>
        </button>

      </div>
    </>
  );
};