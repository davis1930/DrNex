import React from 'react';

interface Props {
  children: React.ReactNode;
  header: React.ReactNode;
}

export const WhatsAppLayout: React.FC<Props> = ({ children, header }) => {
  return (
    <div className="flex h-screen w-full bg-[#E5DDD5] overflow-hidden relative">
      <div className="w-full h-full flex flex-col mx-auto max-w-[600px] shadow-2xl relative bg-[#efeae2]">
        
        {/* Header - Fixed at top */}
        <div className="z-20 w-full">
          {header}
        </div>

        {/* Chat Area - Scrollable */}
        <div className="flex-1 overflow-hidden relative whatsapp-bg flex flex-col">
          {children}
        </div>

      </div>
    </div>
  );
};