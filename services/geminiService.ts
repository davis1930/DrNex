import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Message } from "../types";
import { createPcmBlob } from "../utils/audioUtils";

// Helper to clean unwanted "Thinking" artifacts from response
const cleanResponseText = (text: string): string => {
  if (!text) return "";
  
  // Remove specific artifacts if they appear
  let cleaned = text;
  
  // Patterns to strip out
  const patterns = [
    /Constraint Checklist & Confidence Score:[\s\S]*?(?=Mental Sandbox)/i,
    /Mental Sandbox:[\s\S]*?(?=Let's execute|Let's reply)/i,
    /Constraint Checklist[\s\S]*?Confidence Score: \d+\/\d+/i,
    /Confidence Score: \d+\/\d+/i,
    /Mental Sandbox:/i,
    /Let's execute the tool call/i,
    /^\* \*\*/gm // Artifacts like "* **Title" -> should be handled by formatter, but we can clean here too if needed
  ];

  patterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  // Sometimes the model outputs the answer after a separator like "---" or "Answer:"
  if (cleaned.includes("Answer:")) {
    const parts = cleaned.split("Answer:");
    if (parts.length > 1) return parts[parts.length - 1].trim();
  }

  return cleaned.trim();
};

// Helper to get location with timeout
const getCurrentLocation = (): Promise<{ latitude: number; longitude: number } | null> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    const timeoutId = setTimeout(() => resolve(null), 6000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        console.warn("Geolocation error:", error);
        clearTimeout(timeoutId);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  });
};

// 1. Text Chat Logic
export const sendMessageToDrGemini = async (
  history: Message[],
  userMessage: string
): Promise<{ text: string; mapLinks?: { uri: string; title: string }[] }> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  const location = await getCurrentLocation();
  
  const lowerMsg = userMessage.toLowerCase();
  const mapKeywords = [
    "clinic", "clínica", "hospital", "pharmacy", "farmacia", "droguería",
    "medicina", "medicine", "buy", "comprar", "receta", "prescription",
    "cerca", "near", "ubicación", "location", "donde", "where",
    "urgencia", "emergency", "doctor", "médico", "especialista",
    "centro de salud", "health center", "estoy", "aquí",
    "ayuda", "help", "dolor", "pain", "sangre", "blood", "accidente", "accident",
    "infarto", "heart attack", "me siento mal", "dizzy", "mareado", "perdido", "lost"
  ];
  
  const needsMaps = mapKeywords.some(keyword => lowerMsg.includes(keyword));

  // Base System Instruction - Dr. Nex Persona
  let systemInstruction = `
    Act as Dr. Nex, a professional, empathetic, and trustworthy Triage Doctor.
    Your role is to assess symptoms and provide general health guidance.
    
    CRITICAL RULES:
    1. DO NOT provide specific medical prescriptions (recetas).
    2. If a user asks for medication, refuse and offer to help find a nearby clinic.
    3. Keep your responses concise, similar to a chat messaging style (WhatsApp).
    4. Keep the text length reasonable.
    5. Speak in Spanish unless the user speaks another language.
    6. OUTPUT FORMAT: ONLY output the conversational response. NO internal thoughts.
	7. Never provide a definitive diagnosis, treatment plan, or medical advice. 
	8. Its role is solely to collect information, assist in triage, and generate recommendations for the human clinician.
	9. The patient must be informed that they are interacting with an AI and must explicitly consent to the collection and use of their data before the clinical-intake conversation begins.
	
	EMERGENCY PROTOCOL: 
	1. If the patient expresses symptoms indicative of an immediate life-threatening emergency (e.g., severe chest pain, sudden loss of consciousness, suicidal ideation, or severe bleeding), the conversation must be immediately halted and an escalation protocol triggered.
    2. Interrupt conversation, display emergency INTERACTIVE contact information (911/local emergency number), and advise the user to seek immediate emergency care.
	
    SYMPTOM ANALYSIS & LOCATION RATIONALITY CHECK:
    - The agent must follow a systematic questioning framework for the main complaint, such as Onset, Palliating/Provoking factors, Quality (e.g., sharp, dull), Region/Radiation, Severity (1-10 scale), and Timing/Temporal pattern.
	- Critical Triage Path: The agent must identify a pre-defined list of "Red Flag" symptoms (e.g., fever above $104^\circ\text{F}$, neck stiffness + headache, sudden focal weakness). If a red flag is detected, the triage priority must be escalated to URGENT, and the human clinician/staff must be alerted immediately.
	- The agent must ask about allergies, current medications, and relevant past medical history for the system being discussed (e.g., asking about heart history for chest pain).
	- Clarification Dialogue: If a patient's response is vague or ambiguous (e.g., "I feel sick"), the agent must engage in a clarification dialogue to collect key details (e.g., "Can you tell me more about 'sick'? Do you mean nausea, tired, or something else?").
	- You must be RATIONAL and LOGICAL.
    - If you use the Google Maps tool, you MUST STRICTLY filter the facility type based on the user's symptoms.
    - NEVER show a Veterinary Clinic (Veterinaria) for a human patient. This destroys trust.
    - NEVER show a Dentist/Odontology clinic for non-dental issues (e.g. headache, stomach pain).
    - NEVER show a Mental Health clinic for physical trauma or general illness unless specifically requested.
    
    SEARCH QUERY GENERATION:
    - Address/Coordinates Confirmation: The agent must confirm the patient's current geographic location (address or coordinates) to assess proximity to the clinic, local emergency services, and local health hazards.
	- Urgent Care Appropriateness: If the patient's symptoms are deemed URGENT, the agent must verify if the patient's confirmed location is an appropriate place for waiting/self-transportation versus requiring an ambulance or direction to an Emergency Department (ED).
	- Geofencing/Routing: The agent must calculate the travel time/distance from the patient's location to the clinic. If the patient is over a defined threshold (e.g., >30 minutes travel time), the agent should provide a google maps link closer to the closest facility if available.
	- If user has a toothache -> Search: "Odontología" or "Dentista".
    - If user has a broken bone/accident -> Search: "Urgencias Traumatología" or "Hospital".
    - If user has general pain/fever/flu -> Search: "Urgencias Generales" or "Centro de Salud".
    - If user asks for pharmacy -> Search: "Farmacia 24 horas".
    
    Be precise. Generate confidence by finding the *right* place.
  `;

  if (location) {
      systemInstruction += `
      USER LOCATION: Latitude ${location.latitude}, Longitude ${location.longitude}.
      INSTRUCTION: The user has granted location access. If they need a doctor, DO NOT ASK "Can I have your location?".
      IMMEDIATELY USE THE GOOGLE MAPS TOOL to search for the RELEVANT facility near these coordinates based on the rational rules above.
      
      CRITICAL OUTPUT RULE FOR MAPS:
      1. Start with a brief, 1-2 sentence medical assessment/triage of the symptoms.
      2. Then say: "Basado en tus síntomas, aquí tienes las opciones mas cercanas:"
      3. LIST the top 3-5 options found by the tool in the text response. Include their names and addresses clearly.
      4. The system will automatically generate clickable map buttons based on the places you mention, so ensure the names are accurate to the tool results.
      `;
  } else {
      systemInstruction += `
      User location is UNKNOWN. If they need a clinic, ASK for their city or address first.
      `;
  }

  // Decision Logic: 
  if (needsMaps && location) {
    const toolConfig = { retrievalConfig: { latLng: location } };

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { role: "user", parts: [{ text: systemInstruction }] },
          ...history.map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
          })),
          { role: "user", parts: [{ text: userMessage }] }
        ],
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: toolConfig,
        },
      });

      const text = cleanResponseText(response.text || "Lo siento, no pude encontrar esa información.");
      
      // Extract map links and limit to top 5
      const mapLinks = response.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.filter((c: any) => c.maps?.uri || c.maps?.title)
        .map((c: any) => ({ 
            uri: c.maps.uri, 
            title: c.maps.title 
        }))
        .slice(0, 5); // STRICTLY LIMIT TO 5 RESULTS

      return { text, mapLinks };
    } catch (e) {
      console.error("Maps error", e);
      return { text: "Lo siento, tuve un problema buscando la ubicación. Por favor intenta de nuevo." };
    }
  } else {
    try {
      // Use Pro model for reasoning but reduce budget to ensure output text space
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: [
            { role: "user", parts: [{ text: systemInstruction }] },
            ...history.map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.text }]
            })),
            { role: "user", parts: [{ text: userMessage }] }
        ],
        config: {
          thinkingConfig: { thinkingBudget: 1024 }, 
        },
      });
      
      const text = cleanResponseText(response.text || "");
      if (!text) throw new Error("Empty response from Pro model");
      return { text };

    } catch (e) {
      // Warn instead of error to keep console clean during expected fallbacks
      console.warn("Pro model failed, falling back to Flash:", e);
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
            { role: "user", parts: [{ text: systemInstruction }] },
             ...history.map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.text }]
            })),
            { role: "user", parts: [{ text: userMessage }] }
        ]
       });
       return { text: cleanResponseText(response.text || "Error en el servicio.") };
    }
  }
};

// 3. Live API Connection (Avatar Mode)
export const connectLiveTriageSession = async (
  onOpen: () => void,
  onAudioData: (base64: string) => void,
  onClose: () => void
): Promise<() => void> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  
  // Audio Setup
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  await audioContext.resume();
  
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  
  const systemInstruction = `
    You are Dr. Nex, a friendly, professional, and empathetic medical doctor.
    You are talking to a patient via a voice call.
    Conduct a triage: ask about symptoms, duration, and severity.
    Speak clearly in Spanish.
    DO NOT prescribe medication.
    If they need medicine, tell them to visit a drugstore for basic medication or clinic for advanced simptoms.
    Keep your responses concise.
  `;

  let activeSession: any = null;
  let isCleaningUp = false;

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    config: {
      systemInstruction: systemInstruction,
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
    },
    callbacks: {
      onopen: () => {
        console.log("Live session connected");
        onOpen();
      },
      onmessage: (msg: LiveServerMessage) => {
        const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audioData) {
          onAudioData(audioData);
        }
      },
      onclose: () => {
        if (!isCleaningUp) onClose();
      },
      onerror: (err) => {
        console.error("Live session error", err);
        onClose();
      }
    }
  });

  sessionPromise.then(s => { activeSession = s; });
  
  // Pipe Audio to Session
  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    const pcmBlob = createPcmBlob(inputData);
    sessionPromise.then(session => {
      if (!isCleaningUp) {
        session.sendRealtimeInput({ media: pcmBlob });
      }
    });
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return () => {
    isCleaningUp = true;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (source) source.disconnect();
    if (processor) processor.disconnect();
    if (audioContext && audioContext.state !== 'closed') audioContext.close();

    if (activeSession) {
      activeSession.close();
    } else {
      sessionPromise.then(s => s.close());
    }
  };
};

// 4. Real-time Dictation (Live API Transcription)
export const startLiveDictation = async (
  onTranscription: (text: string) => void,
  onError: (err: any) => void,
  onClose: () => void
): Promise<() => void> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  await audioContext.resume();
  
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  
  let activeSession: any = null;
  let isCleaningUp = false;

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    config: {
      systemInstruction: "You are a continuous dictation tool. Just listen and transcribe indefinitely. Do not speak.",
      responseModalities: [Modality.AUDIO], 
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
      inputAudioTranscription: {} 
    },
    callbacks: {
      onopen: () => console.log("Dictation connected"),
      onmessage: (msg: LiveServerMessage) => {
        const text = msg.serverContent?.inputTranscription?.text;
        if (text) onTranscription(text);
      },
      onerror: (err) => {
        console.error("Dictation error", err);
        onError(err);
      },
      onclose: () => {
        if (!isCleaningUp) onClose();
      }
    }
  });

  sessionPromise.then(s => { activeSession = s; }).catch(onError);

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    const pcmBlob = createPcmBlob(inputData);
    sessionPromise.then(session => {
      if (!isCleaningUp) {
        session.sendRealtimeInput({ media: pcmBlob });
      }
    });
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return () => {
    isCleaningUp = true;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (source) source.disconnect();
    if (processor) processor.disconnect();
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
    if (activeSession) activeSession.close();
    else sessionPromise.then(s => s.close());
  };
};
