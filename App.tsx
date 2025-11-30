import React, { useState, useRef } from 'react';
import { WhatsAppLayout } from './components/WhatsAppLayout';
import { ChatArea } from './components/ChatArea';
import { VoiceAvatarModal } from './components/VoiceAvatarModal';
import { Message } from './types';
import { sendMessageToDrGemini, startLiveDictation } from './services/geminiService';

const App = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hola, soy el Dr. Nex. Soy tu asistente médico de triaje. ¿Cuáles son tus síntomas hoy?",
      sender: 'bot',
      timestamp: new Date().toISOString(),
      type: 'text'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  
  // Ref to hold the cleanup function for dictation
  const stopDictationRef = useRef<(() => void) | null>(null);

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim()) return;

    // Auto-Stop Recording if active
    if (isRecording) {
      if (stopDictationRef.current) {
        stopDictationRef.current();
        stopDictationRef.current = null;
      }
      setIsRecording(false);
    }

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      text: textToSend,
      sender: 'user',
      timestamp: new Date().toISOString(),
      type: 'text'
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      // API Call
      const { text, mapLinks } = await sendMessageToDrGemini(messages, textToSend);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: text,
        sender: 'bot',
        timestamp: new Date().toISOString(),
        type: mapLinks ? 'map_result' : 'text',
        metadata: { mapLinks }
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
      // Optional error handling UI
    } finally {
      setIsTyping(false);
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      // STOP Recording
      if (stopDictationRef.current) {
        stopDictationRef.current();
        stopDictationRef.current = null;
      }
      setIsRecording(false);
    } else {
      // START Recording (Real-time Dictation)
      try {
        setIsRecording(true);
        
        const cleanup = await startLiveDictation(
          (text) => {
            // Real-time update of input field with spacing logic
            const trimmed = text.trim();
            if (!trimmed) return;
            
            setInputText(prev => {
              if (prev.length > 0 && !prev.endsWith(' ')) {
                 return prev + ' ' + trimmed;
              }
              return prev + trimmed;
            });
          },
          (err) => {
            console.error("Dictation error", err);
            setIsRecording(false);
            if (stopDictationRef.current) {
               stopDictationRef.current();
               stopDictationRef.current = null;
            }
          },
          () => {
            console.log("Dictation session closed");
            setIsRecording(false);
            stopDictationRef.current = null;
          }
        );
        
        stopDictationRef.current = cleanup;
      } catch (e) {
        console.error("Failed to start dictation", e);
        setIsRecording(false);
        alert("No se pudo acceder al micrófono. Por favor, verifica los permisos.");
      }
    }
  };

  // Chat Header Component - Mobile Style (White)
  const ChatHeader = (
    <div className="bg-white px-3 py-2 flex items-center justify-between border-b border-gray-200 shadow-sm min-h-[60px]">
      <div className="flex items-center gap-3">
        {/* Profile Pic */}
        <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-100">
          <img 
            src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200&h=200&fit=crop" 
            alt="Dr. Nex" 
            className="w-full h-full object-cover" 
          />
        </div>
        
        {/* Name & Status */}
        <div className="flex flex-col justify-center cursor-default">
           <h2 className="text-black font-semibold text-lg leading-tight">Dr. Nex</h2>
           <p className="text-xs text-gray-500 truncate max-w-[150px]">Médico General • Triaje</p>
        </div>
      </div>

      <div className="flex gap-4 items-center px-1">
         {/* Voice Call Avatar Trigger */}
         <button 
           onClick={() => setIsVoiceModalOpen(true)}
           className="flex items-center gap-2 bg-[#00a884] hover:bg-[#008f6f] text-white px-3 py-1.5 rounded-full shadow-sm transition-all active:scale-95"
           title="Hablar con el Avatar Médico"
         >
           <span className="material-icons text-lg">face_6</span> 
           <span className="text-xs font-semibold uppercase tracking-wide hidden sm:block">Hablar</span>
         </button>
      </div>
    </div>
  );

  return (
    <WhatsAppLayout header={ChatHeader}>
      <ChatArea 
        messages={messages}
        inputRaw={inputText}
        setInputRaw={setInputText}
        onSend={() => handleSend()}
        onMicClick={handleMicClick}
        isRecording={isRecording}
        isTyping={isTyping}
      />
      <VoiceAvatarModal 
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
      />
    </WhatsAppLayout>
  );
};

export default App;