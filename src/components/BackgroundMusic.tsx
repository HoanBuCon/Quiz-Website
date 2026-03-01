import React, { useRef, useState, useEffect, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import { useMusic } from "../context/MusicContext";
import { toast } from "react-hot-toast";
import type { Renderable } from "react-hot-toast";
import { FaMusic, FaPlay, FaPause } from "react-icons/fa";
import { toastDarkStyle, toastLightStyle, toastDarkStyleMobile, toastLightStyleMobile } from "./ToastStyle";
import MediaPlayerBox from "./MediaPlayer";
import "./MediaPlayer.css";

const BackgroundMusic = () => {
  // Danh sách playlists (có thể mở rộng thêm)
  const playlists = [
    {
      id: 'pl_phonk',
      name: 'Phonk',
      tracks: [
        { name: "ALONE IN LORDRAN - INTERWORLD X HOSPICEMANE", src: require("../assets/music/chill_phonk/alone_in_lordran.mp3") },
        { name: "AYLEOND - NNX LXSY", src: require("../assets/music/chill_phonk/ayleond_nnx_lxsy.mp3") },
        { name: "NUMB - INTERWORLD X DEVILISH TRIO", src: require("../assets/music/chill_phonk/numb.mp3") },
        { name: "CLOSE EYES - DVRST", src: require("../assets/music/chill_phonk/close_eyes.mp3") },
        { name: "NEBULAESY - NNX LXSY", src: require("../assets/music/chill_phonk/nebulaesy_nnx_lxsy.mp3") },
        { name: "DEAD INSIDE - АДЛИН", src: require("../assets/music/chill_phonk/dead_inside.mp3") },
        { name: "TWILIGHT - GRAVECHILL", src: require("../assets/music/chill_phonk/twilight.mp3") },
        { name: "TIRED OF PROBLEMS - NUEKI x TOLCHONOV x GLICHERY", src: require("../assets/music/chill_phonk/tired_of_problems.mp3") },
        { name: "SO TIRED - NUEKI x TOLCHONOV", src: require("../assets/music/chill_phonk/so_tired.mp3") },
        { name: "SEA OF PROBLEMS - GLICHERY", src: require("../assets/music/chill_phonk/sea_of_problems.mp3") },
        { name: "SATORU GODJO - NNX LXSY", src: require("../assets/music/chill_phonk/satoru_godjo.mp3") },
        { name: "HEMENESY - NNX LXSY", src: require("../assets/music/chill_phonk/hemenesy.mp3") },
      ]
    },
    { // 35
      id: 'pl_edm',
      name: 'EDM',
      tracks: [
        { name: "FADE - HELL'S SPEAKER REMIX", src: require("../assets/music/edm/fade_hell_speaker.mp3") },
        { name: "WHY DO I? - UNKNOWN BRAIN", src: require("../assets/music/edm/why_do_i.mp3") },
        { name: "NEVADA - VICTONE", src: require("../assets/music/edm/nevada.mp3") },
        { name: "END OF TIME - K-391 X ALAN WALKER X AHRIX", src: require("../assets/music/edm/end_of_time.mp3") },
        { name: "YOU - AXOL X ALEX SKRINDO", src: require("../assets/music/edm/you.mp3") },
        { name: "LONELY WORLD - K-391 & VICTOR CRONE", src: require("../assets/music/edm/lonely_world.mp3") },
        { name: "DIGITAL STRANGERS - K-391", src: require("../assets/music/edm/digital_strangers.mp3") },
        { name: "HEROES TONIGHT - JANJI", src: require("../assets/music/edm/heroes_tonight.mp3") },
        { name: "FEELING - ALTERO", src: require("../assets/music/edm/feeling.mp3") },
        { name: "EARTH - K-391", src: require("../assets/music/edm/earth.mp3") },
        { name: "THE SPECTRE - ALAN WALKER", src: require("../assets/music/edm/the_spectre.mp3") },
        { name: "THE SPECTRE - ALAN WALKER [ALOSA CATCHING SUNRISES GENERATED]", src: require("../assets/music/edm/the_spectre_remix.mp3") },
        { name: "GIZMO - SYN COLE", src: require("../assets/music/edm/gizmo.mp3") },
        { name: "PRETTY GIRL - MAGGIE LINDERMANN", src: require("../assets/music/edm/pretty_girl.mp3") },
        { name: "VIETNAM - FRED EDDY", src: require("../assets/music/edm/vietnam.mp3") },
        { name: "ESCAPING GRAVITY - THEFATRAT & CECILIA GAULT", src: require("../assets/music/edm/escaping_gravity.mp3") },
        { name: "OBLIVION - THEFATRAT [FRED EDDY REMIX]", src: require("../assets/music/edm/oblivion.mp3") },
        { name: "NEVER BE ALONE - THEFATRAT", src: require("../assets/music/edm/never_be_alone.mp3") },
        { name: "MONODY - THEFATRAT", src: require("../assets/music/edm/monody.mp3") },
        { name: "THE CALLING - THEFATRAT", src: require("../assets/music/edm/the_calling.mp3") },
        { name: "MONODY - THEFATRAT", src: require("../assets/music/edm/monody.mp3") },
        { name: "TROPIC LOVE - DIVINERS", src: require("../assets/music/edm/tropic_love.mp3") },
        { name: "HEADLIGHTS - ALOK & ALAN WALKER", src: require("../assets/music/edm/headlights.mp3") },
        { name: "NOTHING AT ALL - MAGSONICS [REMEDEUS REMIX]", src: require("../assets/music/edm/nothing_at_all.mp3") },
        { name: "SIGN - DEAMN", src: require("../assets/music/edm/sign.mp3") },
        { name: "RENDEZVOUS - DEAMN", src: require("../assets/music/edm/rendezvous.mp3") },
        { name: "HYPNOTIZED - DEAMN", src: require("../assets/music/edm/hypnotized.mp3") },
        { name: "INSPIRATION - UNKNOWN BRAIN", src: require("../assets/music/edm/inspiration.mp3") },
        { name: "INVISIBLE - JULIUS DREISIG & ZEUS X CRONA", src: require("../assets/music/edm/invisible.mp3") },
        { name: "SUMMERTIME - K-391", src: require("../assets/music/edm/summertime.mp3") },
        { name: "SUMMERSONG 2018 - ELEKTRONOMIA", src: require("../assets/music/edm/summersong_2018.mp3") },
        { name: "DISCOVER - ET", src: require("../assets/music/edm/discover.mp3") },
        { name: "LEGENDARY - AMADEUS", src: require("../assets/music/edm/legendary.mp3") },
        { name: "ALL NIGHT - IKSON", src: require("../assets/music/edm/all_night.mp3") },
        { name: "SKY HIGH - ELEKTRONOMIA", src: require("../assets/music/edm/sky_high.mp3") },
        { name: "LIMITLESS - ELEKTRONOMIA", src: require("../assets/music/edm/limitless.mp3") },
      ]
    }
  ];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicButtonRef = useRef<HTMLButtonElement | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);

  const [selectedPlaylistIndex, setSelectedPlaylistIndex] = useState(0);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayerBox, setShowPlayerBox] = useState(false);
  const [isPlayerAnimating, setIsPlayerAnimating] = useState(false);
  const [loopMode, setLoopMode] = useState<'queue' | 'track'>("queue");
  const [isRandom, setIsRandom] = useState(false);
  const [isStopped, setIsStopped] = useState(true);
  // Hàng đợi xáo trộn cho Random mode
  const [shuffledQueue, setShuffledQueue] = useState<number[]>([]); // mảng index
  const [shuffledPointer, setShuffledPointer] = useState<number>(0); // vị trí hiện tại trong queue

  // Refs để track user interaction
  const hasPlayedOnce = useRef(false);
  const hasUserInteracted = useRef(false);

  const { isDarkMode } = useTheme();
  const { showMusicPlayer, setShowMusicPlayer, setIsPlaying: setCtxIsPlaying, isBannerVideoPlaying } = useMusic();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Sync isBannerVideoPlaying sang ref để listener luôn lấy giá trị mới nhất
  const isBannerVideoPlayingRef = useRef(isBannerVideoPlaying);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isBannerVideoPlayingRef.current = isBannerVideoPlaying;

    // Nếu vừa đổi trang về Home (video banner ĐANG CHẠY) và nhạc đang bật
    // -> Tạm dừng nhạc mượt mà (Fade Out), ưu tiên video.
    // Nếu user bấm bật lại nhạc bằng tay, do không phụ thuộc 'isPlaying' nên sẽ không tự động tắt nữa.
    if (isBannerVideoPlaying && audioRef.current && !audioRef.current.paused) {
      const audioEl = audioRef.current;
      const initialVolume = audioEl.volume;
      const fadeDuration = 1000; // 1 giây fade out
      const stepTime = 50; // mỗi 50ms giảm 1 lần
      const steps = fadeDuration / stepTime;
      const volumeStep = initialVolume / steps;

      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

      fadeIntervalRef.current = setInterval(() => {
        if (audioEl.volume > volumeStep) {
          audioEl.volume -= volumeStep;
        } else {
          // Khi volume giảm gần hết -> tắt nhạc
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          audioEl.pause();
          audioEl.volume = initialVolume; // Khôi phục lại âm lượng gốc để bật lại sau
          setIsPlaying(false);
          setIsStopped(true);
        }
      }, stepTime);
    }

    return () => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBannerVideoPlaying]);

  // Helper: lấy volume đã lưu (0-100), mặc định 50
  const getSavedVolumePercent = () => {
    try {
      const saved = localStorage.getItem('mediaPlayerVolume');
      const n = saved != null ? parseInt(saved) : NaN;
      if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    } catch { }
    return 50;
  };

  // Áp dụng volume ngay khi mount (trước cả khi mở MediaPlayer)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = getSavedVolumePercent() / 100;
    }
  }, []);

  const tracks = playlists[selectedPlaylistIndex]?.tracks || [];
  const currentTrack = tracks[currentTrackIndex] || (playlists[0]?.tracks?.[0]);
  // Danh sách hiển thị cho dropdown track: theo queue nếu random, ngược lại theo playlist gốc
  const displayIndices = (isRandom && shuffledQueue.length > 0)
    ? shuffledQueue
    : tracks.map((_, i) => i);
  const displayTracks = displayIndices.map(i => tracks[i]).filter(Boolean);

  // Helper function để lấy track name chính xác
  const getCurrentTrackName = (trackIndex = currentTrackIndex, playlistIndex = selectedPlaylistIndex) => {
    const targetTracks = playlists[playlistIndex]?.tracks || [];
    return targetTracks[trackIndex]?.name || 'Unknown Track';
  };
  // Tạo hàng đợi xáo trộn, luôn để current ở đầu
  const buildShuffledQueue = useCallback((total: number, currentIdx: number) => {
    const indices = Array.from({ length: total }, (_, i) => i).filter((i) => i !== currentIdx);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const queue = [currentIdx, ...indices];
    setShuffledQueue(queue);
    setShuffledPointer(0);
  }, []);

  // Rebuild queue khi bật random hoặc khi đổi playlist
  useEffect(() => {
    if (isRandom) {
      buildShuffledQueue(tracks.length, currentTrackIndex);
    } else {
      // Tắt random: clear queue
      setShuffledQueue([]);
      setShuffledPointer(0);
    }
  }, [isRandom, selectedPlaylistIndex]);

  // Đồng bộ pointer nếu currentTrackIndex thay đổi do hành động trực tiếp
  useEffect(() => {
    if (isRandom && shuffledQueue.length > 0) {
      const pos = shuffledQueue.indexOf(currentTrackIndex);
      if (pos !== -1 && pos !== shuffledPointer) {
        setShuffledPointer(pos);
      }
    }
  }, [currentTrackIndex]);

  // Đồng bộ trạng thái playing với Header (MusicContext)
  useEffect(() => {
    try { setCtxIsPlaying(isPlaying); } catch { }
  }, [isPlaying]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Hàm đóng player với animation
  const closePlayerWithAnimation = useCallback(() => {
    if (showPlayerBox) {
      setIsPlayerAnimating(true);
      setTimeout(() => {
        setShowPlayerBox(false);
        setIsPlayerAnimating(false);
        // Đồng bộ về context nếu đang mở từ header
        try { setShowMusicPlayer(false); } catch { }
      }, 500);
    }
  }, [showPlayerBox, setShowMusicPlayer]);

  // Effect để lắng nghe tương tác đầu tiên của user (KHÔNG bao gồm click vào Music button)
  useEffect(() => {
    const handleFirstInteraction = (e: Event) => {
      // Nếu trạng thái đang phát video banner thì không nhận tương tác ở đây
      if (isBannerVideoPlayingRef.current) return;

      // Nếu click vào Music button hoặc player box, không xử lý ở đây
      const target = e.target as Node | null;
      if ((target && musicButtonRef.current?.contains(target)) ||
        (target && playerBoxRef.current?.contains(target))) {
        return;
      }

      if (!hasUserInteracted.current) {
        hasUserInteracted.current = true;

        // Kích hoạt autoplay sau khi có tương tác
        if (!hasPlayedOnce.current && audioRef.current && isStopped) {
          setTimeout(() => {
            autoPlayFirstTrack();
          }, 500);
        }
      }
    };

    // Lắng nghe tất cả các loại tương tác
    const interactionEvents = [
      'click', 'mousedown', 'pointerdown',
      'touchend', 'keydown', 'scroll'
    ];

    interactionEvents.forEach(event => {
      document.addEventListener(event, handleFirstInteraction, {
        passive: true
      });
    });

    return () => {
      interactionEvents.forEach(event => {
        document.removeEventListener(event, handleFirstInteraction);
      });
    };
  }, []);

  // Đồng bộ mở/đóng theo Header (MusicContext)
  useEffect(() => {
    if (showMusicPlayer && !showPlayerBox) {
      setShowPlayerBox(true);
    } else if (!showMusicPlayer && showPlayerBox) {
      closePlayerWithAnimation();
    }
  }, [showMusicPlayer]);

  // Effect để xử lý click outside và ESC
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {

      const target = e.target as Node | null;
      if (
        showPlayerBox &&
        playerBoxRef.current &&
        target &&
        !playerBoxRef.current.contains(target) &&
        !(musicButtonRef.current?.contains(target))
      ) {
        closePlayerWithAnimation();
        try { setShowMusicPlayer(false); } catch { }
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPlayerBox) {
        closePlayerWithAnimation();
        try { setShowMusicPlayer(false); } catch { }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showPlayerBox, closePlayerWithAnimation]); // Thêm showPlayerBox và closePlayerWithAnimation vào dependency array

  // Effect riêng để xử lý ESC key
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPlayerBox) {
        closePlayerWithAnimation();
      }
    };

    window.addEventListener('keydown', handleEscKey);

    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [showPlayerBox, closePlayerWithAnimation]);

  // Function để auto-play track đầu tiên
  const autoPlayFirstTrack = async () => {
    if (!hasPlayedOnce.current && audioRef.current && isStopped) {
      const audioEl = audioRef.current;
      if (!audioEl) return;
      try {
        // Áp dụng volume đã lưu (nếu có)
        audioEl.volume = getSavedVolumePercent() / 100;
        // Random playlist trước, rồi random track trong playlist đó
        const randomPlaylistIndex = Math.floor(Math.random() * playlists.length);
        setSelectedPlaylistIndex(randomPlaylistIndex);
        const selectedTracks = playlists[randomPlaylistIndex].tracks;
        const randomIndex = Math.floor(Math.random() * selectedTracks.length);
        const selectedTrack = selectedTracks[randomIndex];
        setCurrentTrackIndex(randomIndex);
        audioEl.src = selectedTrack.src;
        audioEl.load();

        // Wait for audio to be ready
        await new Promise<void>((resolve) => {
          audioEl.addEventListener('canplaythrough', () => resolve(), { once: true });
        });

        // Attempt to play
        await audioEl.play();

        setIsPlaying(true);
        setIsStopped(false);
        hasPlayedOnce.current = true;

        // Sử dụng trực tiếp selectedTrack.name thay vì selectedTracks[randomIndex].name
        showToast(`Playing: ${selectedTrack.name}`, <FaPlay style={{ color: '#27ae60' }} />);

      } catch (error) {
        // console.error("Autoplay failed:", error);

        // Fallback: Show toast để user biết có thể click để phát nhạc
        showToast('Click Music button to start playing', <FaMusic style={{ color: '#3498db' }} />);
      }
    }
  };

  const showToast = (msg: string, icon?: Renderable) => {
    toast(msg, {
      icon,
      duration: 4000,
      style: isMobile
        ? (isDarkMode ? toastDarkStyleMobile : toastLightStyleMobile)
        : (isDarkMode ? toastDarkStyle : toastLightStyle)
    });
  };

  const playRandomTrack = () => {
    const currentTracks = playlists[selectedPlaylistIndex]?.tracks || [];
    const availableIndices = currentTracks
      .map((_, index) => index)
      .filter(index => index !== currentTrackIndex);
    if (availableIndices.length === 0) {
      changeTrackFromParent(currentTrackIndex);
    } else {
      const randomIndex = Math.floor(Math.random() * availableIndices.length);
      const selectedIndex = availableIndices[randomIndex];
      changeTrackFromParent(selectedIndex);
    }
  };

  const handleMusicClick = async () => {
    if (!audioRef.current) return;

    // Đánh dấu user đã tương tác
    if (!hasUserInteracted.current) {
      hasUserInteracted.current = true;
    }

    if (showPlayerBox) {
      closePlayerWithAnimation();
      try { setShowMusicPlayer(false); } catch { }
    } else {
      setShowPlayerBox(true);
      try { setShowMusicPlayer(true); } catch { }

      // FIX: Nếu chưa có nhạc nào được phát và đây là lần đầu tương tác
      // thì tự động phát nhạc
      if (isStopped && !hasPlayedOnce.current) {
        try {
          const audioEl = audioRef.current;
          if (!audioEl) return;
          // Áp dụng volume đã lưu (nếu có)
          audioEl.volume = getSavedVolumePercent() / 100;
          const randomPlaylistIndex = Math.floor(Math.random() * playlists.length);
          setSelectedPlaylistIndex(randomPlaylistIndex);
          const selectedTracks = playlists[randomPlaylistIndex].tracks;
          const randomIndex = Math.floor(Math.random() * selectedTracks.length);
          const selectedTrack = selectedTracks[randomIndex];
          setCurrentTrackIndex(randomIndex);
          audioEl.src = selectedTrack.src;
          audioEl.load();

          // Wait for audio to be ready
          await new Promise<void>((resolve) => {
            audioEl.addEventListener('canplaythrough', () => resolve(), { once: true });
          });

          // Attempt to play
          await audioEl.play();

          setIsPlaying(true);
          setIsStopped(false);
          hasPlayedOnce.current = true;

          // Sử dụng trực tiếp selectedTrack.name thay vì selectedTracks[randomIndex].name
          showToast(`Playing: ${selectedTrack.name}`, <FaPlay style={{ color: '#27ae60' }} />);

        } catch (error) {
          // error("Autoplay via Music button failed:", error);

          // Nếu autoplay thất bại, chỉ load nhạc sẵn sàng để user có thể play manual
          const randomPlaylistIndex = Math.floor(Math.random() * playlists.length);
          setSelectedPlaylistIndex(randomPlaylistIndex);
          const selectedTracks = playlists[randomPlaylistIndex].tracks;
          const randomIndex = Math.floor(Math.random() * selectedTracks.length);
          const selectedTrack = selectedTracks[randomIndex];
          setCurrentTrackIndex(randomIndex);
          const audioEl2 = audioRef.current;
          if (audioEl2) {
            audioEl2.src = selectedTrack.src;
            audioEl2.load();
          }
          hasPlayedOnce.current = true;

          showToast('Music loaded, click Play to start', <FaMusic style={{ color: '#3498db' }} />);
        }
      }
    }
  };

  const playNextTrack = () => {
    if (!audioRef.current) return;
    const currentTracks = playlists[selectedPlaylistIndex]?.tracks || [];
    if (isRandom && shuffledQueue.length === currentTracks.length && currentTracks.length > 0) {
      const isAtEnd = shuffledPointer >= shuffledQueue.length - 1;
      let nextPtr;
      if (isAtEnd) {
        if (loopMode === 'queue') {
          nextPtr = 0;
        } else {
          return; // không loop queue thì dừng
        }
      } else {
        nextPtr = shuffledPointer + 1;
      }
      const nextIndex = shuffledQueue[nextPtr];
      setShuffledPointer(nextPtr);
      changeTrackFromParent(nextIndex, true); // direct switch tới index đã có
    } else {
      const nextIndex = currentTracks.length > 0 ? (currentTrackIndex + 1) % currentTracks.length : 0;
      changeTrackFromParent(nextIndex);
    }
  };

  const changeTrackFromParent = async (
    index: number | undefined,
    direct: boolean = false,
    action?: 'next' | 'prev'
  ) => {
    const currentTracks = playlists[selectedPlaylistIndex]?.tracks || [];
    let targetIndex = index;

    const audioEl = audioRef.current;
    if (!audioEl) return;
    try {
      // Nếu đang Random và đây là hành động next/prev (không phải chọn trực tiếp)
      if (isRandom && !direct) {
        if (shuffledQueue.length !== currentTracks.length || shuffledQueue.length === 0) {
          buildShuffledQueue(currentTracks.length, currentTrackIndex);
        }
        if (action === 'next') {
          const isAtEnd = shuffledPointer >= shuffledQueue.length - 1;
          const nextPtr = isAtEnd ? (loopMode === 'queue' ? 0 : shuffledPointer) : shuffledPointer + 1;
          if (nextPtr === shuffledPointer && loopMode !== 'queue') return; // không có bài kế tiếp và không loop
          setShuffledPointer(nextPtr);
          targetIndex = shuffledQueue[nextPtr];
        } else if (action === 'prev') {
          const isAtStart = shuffledPointer <= 0;
          const prevPtr = isAtStart ? (loopMode === 'queue' ? shuffledQueue.length - 1 : shuffledPointer) : shuffledPointer - 1;
          if (prevPtr === shuffledPointer && loopMode !== 'queue') return;
          setShuffledPointer(prevPtr);
          targetIndex = shuffledQueue[prevPtr];
        } else if (typeof targetIndex === 'number') {
          // Ví dụ: click chọn từ dropdown track (direct nên thường truyền direct = true)
          const pos = shuffledQueue.indexOf(targetIndex);
          if (pos === -1) {
            buildShuffledQueue(currentTracks.length, targetIndex);
          } else {
            setShuffledPointer(pos);
          }
        }
      }

      // Bảo đảm có index hợp lệ nếu chưa được gán ở trên
      if (typeof targetIndex !== 'number') {
        targetIndex = currentTrackIndex;
      }


      // Dừng audio hiện tại
      if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
      }

      // Đợi một chút
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cập nhật track index trước
      setCurrentTrackIndex(targetIndex);

      // Thiết lập source mới
      audioEl.src = currentTracks[targetIndex].src;

      // Tải và phát nhạc
      audioEl.load();

      // Đảm bảo autoplay
      const playPromise = audioEl.play();

      if (playPromise !== undefined) {
        await playPromise;

        setIsPlaying(true);
        setIsStopped(false);
        // Sử dụng trực tiếp tên track từ currentTracks[targetIndex] thay vì getCurrentTrackName
        showToast(`Playing: ${currentTracks[targetIndex]?.name || 'Unknown Track'}`, <FaPlay style={{ color: '#27ae60' }} />);
      }

    } catch (error) {
      // console.error("Failed to change track:", error);

      // Retry mechanism - sử dụng trực tiếp targetIndex và currentTracks đã có sẵn
      setTimeout(async () => {
        try {
          if (audioEl) {
            await audioEl.play();
            setIsPlaying(true);
            setIsStopped(false);
            // Sử dụng trực tiếp tên track từ currentTracks và targetIndex (an toàn hoá index)
            const safeIndex = typeof targetIndex === 'number' ? targetIndex : currentTrackIndex;
            showToast(`Playing: ${currentTracks[safeIndex]?.name || 'Unknown Track'}`, <FaPlay style={{ color: '#27ae60' }} />);
          }
        } catch (retryError) {
          // console.error("Retry failed:", retryError);
        }
      }, 200);
    }
  };

  // Đổi playlist từ MediaPlayer (scope component)
  const handleChangePlaylist = (idx: number, userTriggered: boolean = false) => {
    if (idx === selectedPlaylistIndex) return;
    setSelectedPlaylistIndex(idx);
    const targetTracks = playlists[idx]?.tracks || [];
    const randomIndex = targetTracks.length > 0 ? Math.floor(Math.random() * targetTracks.length) : 0;
    setCurrentTrackIndex(randomIndex);
    if (audioRef.current) {
      const audioEl = audioRef.current;
      const selectedTrack = targetTracks[randomIndex];
      audioEl.pause();
      audioEl.currentTime = 0;
      if (selectedTrack) {
        audioEl.src = selectedTrack.src;
        audioEl.load();
        const shouldAutoplay = userTriggered || isPlaying || !hasPlayedOnce.current;
        if (shouldAutoplay) {
          const onReadyAndPlay = async () => {
            try {
              await new Promise<void>((resolve) => {
                // Nếu đã có thể play, resolve ngay
                if (audioEl.readyState >= 3) {
                  resolve();
                  return;
                }
                audioEl.addEventListener('canplaythrough', () => resolve(), { once: true });
              });
              await audioEl.play();
              setIsPlaying(true);
              setIsStopped(false);
              hasPlayedOnce.current = true;
              // Sử dụng trực tiếp selectedTrack.name thay vì getCurrentTrackName
              showToast(`Playing: ${selectedTrack.name}`, <FaPlay style={{ color: '#27ae60' }} />);
            } catch (err) {
              // Có thể bị chặn autoplay do policy, giữ trạng thái loaded để user bấm play
            }
          };
          onReadyAndPlay();
        }
      }
    }
  };

  return (
    <div className="music-container">
      <audio
        ref={audioRef}
        src={currentTrack.src}
        loop={loopMode === "track"}
        onEnded={() => {
          if (loopMode === "queue") {
            playNextTrack();
          }
        }}
        preload="metadata"
      />

      {(showPlayerBox || isPlayerAnimating) && (
        <div ref={playerBoxRef}>
          <MediaPlayerBox
            audioRef={audioRef}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            tracks={tracks}
            displayTracks={displayTracks}
            displayIndices={displayIndices}
            currentTrackIndex={currentTrackIndex}
            setCurrentTrackIndex={setCurrentTrackIndex}
            loopMode={loopMode}
            setLoopMode={setLoopMode}
            isRandom={isRandom}
            setIsRandom={setIsRandom}
            setShowPlayerBox={setShowPlayerBox}
            showToast={showToast}
            isStopped={isStopped}
            setIsStopped={setIsStopped}
            changeTrackFromParent={changeTrackFromParent}
            isAnimating={isPlayerAnimating}
            className={showPlayerBox && !isPlayerAnimating ? 'show' : ''}
            playlists={playlists}
            selectedPlaylistIndex={selectedPlaylistIndex}
            onChangePlaylist={(idx: number) => handleChangePlaylist(idx)}
          />
        </div>
      )}
    </div>
  );
};

export default BackgroundMusic;