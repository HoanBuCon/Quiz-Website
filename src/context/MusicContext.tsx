import React, { createContext, useContext, useState, ReactNode } from 'react';

interface MusicContextType {
  showMusicPlayer: boolean;
  setShowMusicPlayer: (show: boolean) => void;
  toggleMusicPlayer: () => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  isBannerVideoPlaying: boolean;
  setIsBannerVideoPlaying: (playing: boolean) => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

interface MusicProviderProps {
  children: ReactNode;
}

export const MusicProvider: React.FC<MusicProviderProps> = ({ children }) => {
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBannerVideoPlaying, setIsBannerVideoPlaying] = useState(false);

  const toggleMusicPlayer = () => {
    setShowMusicPlayer(prev => !prev);
  };

  return (
    <MusicContext.Provider value={{
      showMusicPlayer,
      setShowMusicPlayer,
      toggleMusicPlayer,
      isPlaying,
      setIsPlaying,
      isBannerVideoPlaying,
      setIsBannerVideoPlaying
    }}>
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (context === undefined) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};
