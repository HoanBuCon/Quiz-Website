import React, { useState, useEffect } from "react";
import {
  FaStepBackward,
  FaStepForward,
  FaPause,
  FaPlay,
  FaRandom,
  FaStop,
  FaSync,
  FaVolumeUp,
  FaMusic,
} from "react-icons/fa";
import "./MediaPlayer.css";
import type { Renderable } from 'react-hot-toast';
import { useMusic } from "../context/MusicContext";

// Types
type Track = { name: string; src: any };
type Playlist = { id?: string; name: string; tracks: Track[] };
type LoopMode = 'queue' | 'track';

interface MediaPlayerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  currentTrack: Track;
  tracks: Track[];
  currentTrackIndex: number;
  setCurrentTrackIndex: React.Dispatch<React.SetStateAction<number>>;
  loopMode: LoopMode;
  setLoopMode: React.Dispatch<React.SetStateAction<LoopMode>>;
  isRandom: boolean;
  setIsRandom: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPlayerBox: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (msg: string, icon?: Renderable) => void;
  setIsStopped: React.Dispatch<React.SetStateAction<boolean>>;
  changeTrackFromParent?: (index?: number, direct?: boolean, action?: 'next' | 'prev') => void | Promise<void>;
  isAnimating: boolean;
  className?: string;
  // Optional playlist props
  playlists?: Playlist[];
  selectedPlaylistIndex?: number;
  onChangePlaylist?: (idx: number, userTriggered?: boolean) => void;
  displayTracks?: Track[];
  displayIndices?: number[];
  // Optional state passed down but not used directly here
  isStopped?: boolean;
}

const MediaPlayer: React.FC<MediaPlayerProps> = ({
  audioRef,
  isPlaying,
  setIsPlaying,
  currentTrack,
  tracks,
  currentTrackIndex,
  setCurrentTrackIndex,
  loopMode,
  setLoopMode,
  isRandom,
  setIsRandom,
  setShowPlayerBox,
  showToast,
  setIsStopped,
  changeTrackFromParent,
  isAnimating,
  className,
  // Optional playlist props
  playlists,
  selectedPlaylistIndex,
  onChangePlaylist,
  displayTracks,
  displayIndices,
}: MediaPlayerProps) => {
  const [showLoopOptions, setShowLoopOptions] = useState(false);
  const { setShowMusicPlayer } = useMusic();
  const [progress, setProgress] = useState(0);
  const [isChangingTrack, setIsChangingTrack] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isTracksOpen, setIsTracksOpen] = useState(false);
  const [volume, setVolume] = useState(() => {
    // Khôi phục volume từ localStorage hoặc mặc định 50
    const savedVolume = localStorage.getItem('mediaPlayerVolume');
    return savedVolume ? parseInt(savedVolume) : 50;
  }); // Volume từ 0-100
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  // Nếu được truyền displayTracks/displayIndices thì dùng để hiển thị dropdown theo hàng đợi

  // Playlist props (optional): playlists, selectedPlaylistIndex, onChangePlaylist
  // Nếu không truyền, component vẫn hoạt động bình thường với tracks hiện tại

  // Helper function để lấy track name chính xác
  const getCurrentTrackName = (trackIndex = currentTrackIndex) => {
    return tracks[trackIndex]?.name || currentTrack?.name || 'Unknown Track';
  };

  useEffect(() => {
    const updateProgress = () => {
      if (audioRef.current && !isChangingTrack) {
        const value = (audioRef.current.currentTime / audioRef.current.duration) * 100;
        setProgress(isNaN(value) ? 0 : value);
        setCurrentTime(audioRef.current.currentTime || 0);
        setDuration(audioRef.current.duration || 0);
      }
    };
    const interval = setInterval(updateProgress, 500);
    return () => clearInterval(interval);
  }, [audioRef, isChangingTrack]);

  // Áp dụng volume đã lưu vào audio element khi component mount
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [audioRef, volume]);

  // FIX: Sửa lại nút Pause để không tắt media player - thêm stopPropagation
  const togglePlayPause = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Ngăn event bubbling
    e.stopPropagation();
    e.preventDefault();

    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      showToast("Paused", <FaPause style={{ color: "#f39c12" }} />);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        setIsStopped(false);
        // Sử dụng trực tiếp currentTrack.name thay vì getCurrentTrackName()
        showToast(`Playing: ${currentTrack?.name || tracks[currentTrackIndex]?.name || 'Unknown Track'}`, <FaPlay style={{ color: "#27ae60" }} />);
      }).catch(console.error);
    }
  };

  const stop = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setIsStopped(true);
    setShowPlayerBox(false);
    // Đồng bộ tắt nút Music trên Header
    try { setShowMusicPlayer(false); } catch { }
    showToast("Stopped", <FaStop style={{ color: "#e74c3c" }} />);
  };

  const changeTrack = async (index: number) => {
    if (!audioRef.current || isChangingTrack) return;

    setIsChangingTrack(true);

    try {
      // console.log('Local change track to:', tracks[index].name);

      // Dừng audio hiện tại
      audioRef.current.pause();
      audioRef.current.currentTime = 0;

      // Đợi một chút
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cập nhật track index trước
      setCurrentTrackIndex(index);

      // Thiết lập source mới
      audioRef.current.src = tracks[index].src;

      // Load và play
      audioRef.current.load();

      // Đảm bảo autoplay
      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        await playPromise;
        // console.log('Track played successfully');

        setIsPlaying(true);
        setIsStopped(false);
        // Sử dụng trực tiếp tên track từ tracks[index] thay vì getCurrentTrackName
        showToast(`Playing: ${tracks[index]?.name || 'Unknown Track'}`, <FaPlay style={{ color: "#27ae60" }} />);
      }

    } catch (error) {
      // console.error("Failed to change track:", error);

      // Retry mechanism
      setTimeout(async () => {
        try {
          if (audioRef.current) {
            await audioRef.current.play();
            setIsPlaying(true);
            setIsStopped(false);
            // Sử dụng trực tiếp tên track từ tracks[index] trong retry
            showToast(`Playing: ${tracks[index]?.name || 'Unknown Track'}`, <FaPlay style={{ color: "#27ae60" }} />);
          }
        } catch (retryError) {
          // console.error("Retry failed:", retryError);
        }
      }, 200);
    } finally {
      setIsChangingTrack(false);
    }
  };

  const next = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    if (isChangingTrack) return;

    if (isRandom) {
      if (changeTrackFromParent) {
        changeTrackFromParent(undefined, false, 'next');
      } else {
        const nextIndex = (currentTrackIndex + 1) % tracks.length;
        changeTrack(nextIndex);
      }
    } else {
      const nextIndex = (currentTrackIndex + 1) % tracks.length;
      if (changeTrackFromParent) {
        changeTrackFromParent(nextIndex);
      } else {
        changeTrack(nextIndex);
      }
    }
  };

  const prev = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    if (isChangingTrack) return;

    if (isRandom) {
      if (changeTrackFromParent) {
        changeTrackFromParent(undefined, false, 'prev');
      } else {
        const prevIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
        changeTrack(prevIndex);
      }
    } else {
      const prevIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
      if (changeTrackFromParent) {
        changeTrackFromParent(prevIndex);
      } else {
        changeTrack(prevIndex);
      }
    }
  };

  const toggleRandom = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    setIsRandom((prev) => !prev);
    showToast(!isRandom ? "Random ON" : "Random OFF", <FaRandom />);
  };

  const handleLoopModeChange = (mode: LoopMode, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    setLoopMode(mode);
    setShowLoopOptions(false);

    // Cập nhật thuộc tính loop của audio element
    if (audioRef.current) {
      audioRef.current.loop = mode === "track";
    }

    showToast(`Loop mode: ${mode === "track" ? "Track" : "Queue"}`, <FaSync />);
  };

  const toggleLoopOptions = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    setShowLoopOptions((prev) => !prev);
  };

  const seekAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();

    if (!audioRef.current || isChangingTrack) return;
    const percent = parseFloat(e.target.value);
    const newTime = (percent / 100) * audioRef.current.duration;
    audioRef.current.currentTime = newTime;
    setProgress(percent);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    // Lưu volume vào localStorage
    localStorage.setItem('mediaPlayerVolume', newVolume.toString());
    if (audioRef.current) {
      audioRef.current.volume = newVolume / 100;
    }
  };

  const handleVolumeMouseDown = (e: React.SyntheticEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setIsDraggingVolume(true);
  };

  const handleVolumeMouseUp = (e: React.SyntheticEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setIsDraggingVolume(false);
  };

  // Hàm formatTime chuyển giây thành mm:ss
  function formatTime(time: number) {
    if (isNaN(time) || time === Infinity) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // FIX: Thêm handler để ngăn click bubbling cho toàn bộ media player
  const handlePlayerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Chỉ ngăn propagation nếu click vào các nút hoặc timeline
    const target = e.target as (HTMLElement & { type?: string });
    if (target.tagName === 'BUTTON' || target.type === 'range') {
      e.stopPropagation();
    }
  };

  return (
    <div className={`media-player-box ${isAnimating ? 'slide-out' : ''} ${className || ''}`} onClick={handlePlayerClick}>
      <div className="track-name">{currentTrack.name}</div>
      <div className="timeline-container">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={progress}
          onChange={seekAudio}
          className="timeline-slider"
          disabled={isChangingTrack}
        />
        <div className="time-display">
          <span className="current-time">{formatTime(currentTime)}</span>
          <span className="total-time">{formatTime(duration)}</span>
        </div>
      </div>
      <div className="controls-container">
        {/* Volume Control - Left Side */}
        <div className="volume-control">
          <div className="control-box">
            <button
              type="button"
              className="volume-button"
              onClick={(e) => {
                e.stopPropagation();
                setIsVolumeOpen((prev) => !prev);
              }}
              onBlur={() => {
                if (!isDraggingVolume) {
                  setTimeout(() => setIsVolumeOpen(false), 100);
                }
              }}
              title="Volume Control"
            >
              <FaVolumeUp />
            </button>
            {isVolumeOpen && (
              <div className="volume-panel">
                <span className="volume-label">Volume</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={handleVolumeChange}
                  onMouseDown={handleVolumeMouseDown}
                  onMouseUp={handleVolumeMouseUp}
                  onTouchStart={handleVolumeMouseDown}
                  onTouchEnd={handleVolumeMouseUp}
                  className="volume-slider"
                  title="Volume"
                />
                <span className="volume-value">{volume}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Controls - Center */}
        <div className="main-controls">
          <div className="control-row">
            <button onClick={prev} title="Previous" disabled={isChangingTrack}>
              <FaStepBackward />
            </button>
            <button onClick={togglePlayPause} title="Pause / Continue">
              {isPlaying ? <FaPause /> : <FaPlay />}
            </button>
            <button onClick={next} title="Next" disabled={isChangingTrack}>
              <FaStepForward />
            </button>
          </div>
          <div className="control-row">
            <button
              onClick={toggleRandom}
              className={isRandom ? "active" : ""}
              title="Toggle Random"
            >
              <FaRandom />
            </button>
            <button onClick={stop} title="Stop">
              <FaStop />
            </button>
            <div className="loop-container">
              <button
                onClick={toggleLoopOptions}
                className={`loop-btn${loopMode === "track" ? " active" : ""}`}
                title="Loop Options"
                hidden={showLoopOptions}
              >
                <FaSync />
              </button>
              {showLoopOptions && (
                <div className="loop-options">
                  <button
                    className={loopMode === "queue" ? "active" : ""}
                    onClick={(e) => handleLoopModeChange("queue", e)}
                  >
                    Loop Queue
                  </button>
                  <button
                    className={loopMode === "track" ? "active" : ""}
                    onClick={(e) => handleLoopModeChange("track", e)}
                  >
                    Loop Track
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Track Selector - Right Side */}
        {Array.isArray(tracks) && tracks.length > 0 && (
          <div className="track-control">
            <div className="control-box">
              <button
                type="button"
                className="track-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTracksOpen((prev) => !prev);
                }}
                onBlur={() => setTimeout(() => setIsTracksOpen(false), 100)}
                title="Select Track"
              >
                <FaMusic />
              </button>
              {isTracksOpen && (
                <div className="track-panel">
                  <div className="track-panel-header">
                    <span className="track-panel-title">Select Track</span>
                  </div>
                  <div className="track-panel-content">
                    {(Array.isArray(displayTracks) ? displayTracks : tracks).map((t, idx) => {
                      const sourceIndices = Array.isArray(displayIndices) ? displayIndices : tracks.map((_, i) => i);
                      const realIndex = sourceIndices[idx];
                      const isActive = realIndex === (Number.isInteger(currentTrackIndex) ? currentTrackIndex : 0);
                      return (
                        <button
                          key={`${t.name}-${realIndex}`}
                          type="button"
                          className={`track-panel-item${isActive ? ' active' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsTracksOpen(false);
                            if (realIndex !== currentTrackIndex) {
                              if (changeTrackFromParent) {
                                changeTrackFromParent(realIndex, true);
                              } else {
                                // fallback local change
                                changeTrack(realIndex);
                              }
                            }
                          }}
                          role="option"
                          aria-selected={isActive}
                          title={t.name}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Playlist selector: hiển thị nếu có playlists và handler */}
      {Array.isArray(playlists) && typeof onChangePlaylist === 'function' && (
        <div className="playlist-selector">
          <div className={`playlist-dropdown ${isPlaylistOpen ? 'open' : ''}`}>
            <button
              type="button"
              className="playlist-dropdown-button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPlaylistOpen((prev) => !prev);
              }}
              onBlur={() => setTimeout(() => setIsPlaylistOpen(false), 100)}
              title="Select playlist"
            >
              <span className="playlist-dropdown-label">
                {playlists?.[selectedPlaylistIndex ?? 0]?.name || `Playlist ${Number.isInteger(selectedPlaylistIndex) ? (Number(selectedPlaylistIndex) + 1) : 1}`}
              </span>
              <span className="playlist-dropdown-arrow" aria-hidden>▼</span>
            </button>
            {isPlaylistOpen && (
              <div className="playlist-dropdown-menu" role="listbox">
                {playlists.map((pl, idx) => {
                  const isActive = idx === (Number.isInteger(selectedPlaylistIndex) ? selectedPlaylistIndex : 0);
                  return (
                    <button
                      key={pl.id || idx}
                      type="button"
                      className={`playlist-dropdown-item${isActive ? ' active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsPlaylistOpen(false);
                        if (idx !== selectedPlaylistIndex) {
                          onChangePlaylist(idx, true);
                        }
                      }}
                      role="option"
                      aria-selected={isActive}
                    >
                      {pl.name || `Playlist ${idx + 1}`}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaPlayer;