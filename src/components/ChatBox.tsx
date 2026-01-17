import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getToken } from "../utils/auth";
import { ChatAPI, getApiBaseUrl } from "../utils/api";
import { FiPaperclip, FiSend, FiTrash2, FiEyeOff } from "react-icons/fi";
import { FaCommentDots } from "react-icons/fa";
import userAvatar from "../assets/user_avatar.gif";

// --- INTERFACES & HELPERS ---
interface ChatMessage {
  id: string;
  userId: string;
  content?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: "image" | "video" | "file" | null;
  createdAt: string;
  user?: { id: string; name?: string | null; email: string; avatarUrl?: string | null };
  replyTo?: string | null;
  hidden?: boolean;
}

function formatDateSeparator(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  if (isSameDay(date, now)) return "Hôm nay";
  if (isSameDay(date, yesterday)) return "Hôm qua";

  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function renderMessageContent(text: string, isMine: boolean): React.ReactNode {
  if (!text) return null;

  const parts = text.split(/(\s+)/); // Split by whitespace to process words

  return parts.map((part, i) => {
    // Basic clean to remove trailing punctuation for checking
    const cleanPart = part.replace(/[.,;!?)]+$/, '');
    const trailing = part.slice(cleanPart.length);

    // Check patterns - ONLY http/https or www.
    const isUrl = /^(https?:\/\/|www\.)/i.test(cleanPart);

    if (isUrl && cleanPart.length > 4) {
      let href = cleanPart;
      if (!href.startsWith('http')) {
        href = 'https://' + href;
      }

      return (
        <React.Fragment key={i}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${isMine ? 'text-white underline decoration-white/50 hover:decoration-white' : 'text-blue-600 dark:text-blue-400 hover:underline'} break-all font-medium`}
            onClick={(e) => e.stopPropagation()}
          >{cleanPart}</a>{trailing}
        </React.Fragment>
      );
    }

    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

interface ChatBoxProps {
  hideOnDesktop?: boolean;
}

const ChatBox: React.FC<ChatBoxProps> = ({ hideOnDesktop = false }) => {
  // --- 1. STATE & REF (UI) ---
  const [open, setOpen] = useState(false);
  const openRef = useRef<boolean>(false);
  useEffect(() => {
    openRef.current = open;
    window.dispatchEvent(new CustomEvent("chat:status", { detail: { open } }));
  }, [open]);
  const [unread, setUnread] = useState<number>(0);

  // Auth Token - Use dummy token for cookie-based auth or real token from localStorage
  const token = useMemo(() => {
    const storedToken = getToken();
    // If no token in localStorage, use dummy token to indicate cookie-based auth
    return storedToken || '_cookie_auth_';
  }, []);

  // Get Current User ID from API (Cookie-based auth - can't decode dummy token)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
          credentials: 'include',
          headers: token !== '_cookie_auth_' ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (response.ok) {
          const data = await response.json();
          setCurrentUserId(data.user?.id || null);
        }
      } catch { }
    };

    fetchCurrentUser();
  }, [token]);

  // Open/Close Handlers
  const openChat = () => {
    if (!openRef.current) {
      setOpen(true);
      setUnread(0);
      if (token) ChatAPI.markAsRead(token).catch(() => { });
    }
  };

  const closeChat = () => { if (openRef.current) setOpen(false); };

  const toggleChat = () => setOpen((v) => {
    const nv = !v;
    if (nv) {
      setUnread(0);
      if (token) ChatAPI.markAsRead(token).catch(() => { });
    }
    return nv;
  });

  // Sync Unread to LocalStorage/Window
  useEffect(() => {
    try { localStorage.setItem('chat_unread_count', String(unread)); } catch { }
    try { window.dispatchEvent(new CustomEvent('chat:unread', { detail: { count: unread } })); } catch { }
  }, [unread]);

  // Header event integration
  useEffect(() => {
    const handleChatOpen: EventListener = () => openChat();
    const handleChatClose: EventListener = () => closeChat();
    const handleChatToggle: EventListener = () => toggleChat();
    window.addEventListener("chat:open", handleChatOpen);
    window.addEventListener("chat:close", handleChatClose);
    window.addEventListener("chat:toggle", handleChatToggle);
    return () => {
      window.removeEventListener("chat:open", handleChatOpen);
      window.removeEventListener("chat:close", handleChatClose);
      window.removeEventListener("chat:toggle", handleChatToggle);
    };
  }, []);

  // --- 2. DATA STATE ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 10;
  const [hasMore, setHasMore] = useState(true);
  const loadingOlderRef = useRef(false);

  // UI Refs
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // UI State
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isMultiline, setIsMultiline] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  // Biến này để lưu config từ server, có thể dùng để hiển thị text "Active in 5m" nếu cần
  // eslint-disable-next-line
  const [onlineWindow, setOnlineWindow] = useState<number>(5);

  // Hidden Messages
  const [hiddenMessages, setHiddenMessages] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('chat_hidden_messages');
      if (stored) return new Set(JSON.parse(stored));
    } catch { }
    return new Set();
  });
  useEffect(() => {
    try { localStorage.setItem('chat_hidden_messages', JSON.stringify(Array.from(hiddenMessages))); } catch { }
  }, [hiddenMessages]);

  // Click Outside Menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- 3. LOGIC MẠNG MỚI (POLLING & INSTANT UI) ---

  // Helper: Merge messages để tránh trùng lặp
  const mergeMessages = (prev: ChatMessage[], incoming: ChatMessage[]) => {
    const map = new Map<string, ChatMessage>();
    for (const m of prev) map.set(m.id, m);
    for (const m of incoming) map.set(m.id, m);
    return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  // 3.1. Poll Online Count (10s/lần)
  useEffect(() => {
    if (!token) return;
    const fetchOnline = async () => {
      try {
        const res = await ChatAPI.getOnlineCount(token);
        setOnlineCount(res.count);
        setOnlineWindow(res.windowMinutes);
      } catch { }
    };
    fetchOnline();
    const timer = setInterval(fetchOnline, 10000);
    return () => clearInterval(timer);
  }, [token]);

  // 3.2. Poll Unread Count (Khi chat đóng - 10s/lần)
  useEffect(() => {
    if (open || !token) return;
    const fetchUnread = () => {
      ChatAPI.getUnreadCount(token)
        .then(data => setUnread(data.count))
        .catch(() => { });
    };
    fetchUnread();
    const timer = setInterval(fetchUnread, 10000);
    return () => clearInterval(timer);
  }, [open, token]);

  // 3.3. Poll New Messages (Khi chat mở - 3s/lần)
  // Thay thế hoàn toàn SSE
  useEffect(() => {
    if (!open || !token) return;

    let isCancelled = false;
    const fetchNewMessages = async () => {
      if (document.hidden) return; // Tiết kiệm tài nguyên khi tab ẩn

      try {
        // Lấy thời gian tin nhắn cuối cùng để chỉ tải tin mới hơn
        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        const afterParam = lastMsg ? lastMsg.createdAt : undefined;

        const newMsgs = await ChatAPI.list({ limit: 20, after: afterParam }, token);

        if (!isCancelled && newMsgs && newMsgs.length > 0) {
          setMessages(prev => {
            const merged = mergeMessages(prev, newMsgs);
            // Nếu có tin mới, scroll xuống dưới
            if (merged.length > prev.length) {
              setTimeout(() => {
                if (listRef.current) {
                  const { scrollTop, scrollHeight, clientHeight } = listRef.current;
                  const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
                  if (isNearBottom) listRef.current.scrollTo({ top: scrollHeight, behavior: 'smooth' });
                }
              }, 100);
            }
            return merged;
          });
        }
      } catch { }
    };

    // fetchNewMessages(); // Removed immediate call to prevent race condition with loadInitial
    const intervalId = setInterval(fetchNewMessages, 3000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [open, token, messages]); // messages dependency quan trọng để lấy lastMsg

  // 3.4. Load Initial Messages (Khi mở chat)
  const loadInitial = async () => {
    if (!token) return;
    try {
      const data = await ChatAPI.list({ limit: PAGE_SIZE }, token);
      setMessages(() => mergeMessages([], data));
      setHasMore((data?.length || 0) === PAGE_SIZE);
      // Sử dụng setTimeout để đảm bảo DOM đã được cập nhật hoàn toàn (bao gồm layout của 10 tin nhắn)
      // trước khi thực hiện scroll. requestAnimationFrame đôi khi chạy quá sớm.
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }, 100);
    } catch { }
  };

  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setHasMore(true);
    loadInitial();
    requestAnimationFrame(() => { if (inputRef.current) autoResizeTextarea(inputRef.current); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 3.5. Load Older Messages (Khi cuộn lên trên)
  const loadOlder = async () => {
    if (!token || loadingOlderRef.current || !hasMore) return;
    const earliest = messages.length ? messages[0].createdAt : null;
    if (!earliest) return;

    loadingOlderRef.current = true;
    const el = listRef.current;
    const prevH = el?.scrollHeight || 0;

    try {
      const data = await ChatAPI.list({ limit: PAGE_SIZE, before: earliest }, token);
      setHasMore((data?.length || 0) === PAGE_SIZE);
      if (data && data.length) {
        setMessages((prev) => mergeMessages(data, prev));
        requestAnimationFrame(() => {
          const newH = el?.scrollHeight || 0;
          if (el) el.scrollTop = newH - prevH;
        });
      }
    } catch { }
    finally {
      loadingOlderRef.current = false;
    }
  };

  // 3.6. SEND MESSAGE (Instant UI Update)
  const doSend = async () => {
    if (!token) return;
    const text = input.trim();
    if (!text && !file) return;
    if (text.length > 2000) { alert('Tin nhắn tối đa 2000 ký tự'); return; }
    if (file && file.size > 10 * 1024 * 1024) { alert('Giới hạn tệp là 10MB'); return; }

    setLoading(true);
    try {
      // Gửi và nhận lại tin nhắn vừa tạo từ server
      const sentMsg = await ChatAPI.send({ content: text || undefined, file: file || undefined }, token);

      // Reset input ngay lập tức
      setInput("");
      setFile(null);
      setIsMultiline(false);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
          inputRef.current.style.overflowY = 'hidden';
        }
      });

      // INSTANT UPDATE: Thêm ngay vào state
      if (sentMsg) {
        setMessages(prev => {
          const exists = prev.some(m => m.id === sentMsg.id);
          if (exists) return prev;
          return [...prev, sentMsg];
        });
        // Scroll xuống đáy
        setTimeout(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
        }, 100);
      }
    } catch (e) {
      // console.error("Gửi lỗi:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSend();
  };

  // --- 4. VIEWPORT & DRAG LOGIC (GIỮ NGUYÊN TỪ OLD CHATBOX) ---

  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
  const isMobile = vw < 1024;

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const btnSize = isMobile ? 56 : 60;
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const panelWidth = isMobile ? Math.min(vw - 16, 500) : 500;
  const panelHeight = isMobile ? vh - 80 : Math.min(750, vh - 100);
  const gap = 16;

  const getDefaultBtnPos = (viewportWidth: number, viewportHeight: number) => ({
    x: viewportWidth - btnSize - 24,
    y: viewportHeight - btnSize - 24
  });

  const readBtnPos = (viewportWidth: number, viewportHeight: number) => {
    try {
      const raw = localStorage.getItem('chat_btn_pos');
      if (raw) {
        const p = JSON.parse(raw);
        return {
          x: clamp(p.x, 8, viewportWidth - btnSize - 8),
          y: clamp(p.y, 8, viewportHeight - btnSize - 8)
        };
      }
    } catch { }
    return getDefaultBtnPos(viewportWidth, viewportHeight);
  };

  const [btnPos, setBtnPos] = useState(() => readBtnPos(vw, vh));

  // Panel Alignment State ('left' | 'right')
  const [panelAlign, setPanelAlign] = useState<'left' | 'right'>(() => {
    try {
      const saved = localStorage.getItem('chat_panel_align');
      return (saved === 'left' || saved === 'right') ? saved : 'right';
    } catch { return 'right'; }
  });

  const persistPanelAlign = (align: 'left' | 'right') => {
    setPanelAlign(align);
    try { localStorage.setItem('chat_panel_align', align); } catch { }
  };

  const [isDragging, setIsDragging] = useState(false);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingPanelPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setBtnPos(p => ({
      x: clamp(p.x, 8, vw - btnSize - 8),
      y: clamp(p.y, 8, vh - btnSize - 8)
    }));
  }, [vw, vh, btnSize]);

  const persistBtnPos = (p: { x: number; y: number }) => {
    try { localStorage.setItem('chat_btn_pos', JSON.stringify(p)); } catch { }
  };

  const getPanelPos = () => {
    if (isMobile) return { x: (vw - panelWidth) / 2, y: 40 };

    // Logic position based on alignment
    let panelX = 0;
    if (panelAlign === 'right') {
      panelX = btnPos.x + btnSize + gap;
      // Auto flip if overflow
      if (panelX + panelWidth > vw - 8) panelX = btnPos.x - panelWidth - gap;
    } else {
      panelX = btnPos.x - panelWidth - gap;
      // Auto flip if overflow
      if (panelX < 8) panelX = btnPos.x + btnSize + gap;
    }

    let panelY = btnPos.y;
    // Keep panel vertically on screen
    panelY = clamp(panelY, 8, vh - panelHeight - 8);

    // Safety clamp for X to keep it visible regardless of align
    // But allow full width
    if (panelX < 8) panelX = 8;
    if (panelX + panelWidth > vw - 8) panelX = vw - panelWidth - 8;

    return { x: panelX, y: panelY };
  };

  // Drag Bubble
  const startDragBubble = (startX: number, startY: number) => {
    setIsDragging(true);
    const sx = btnPos.x;
    const sy = btnPos.y;
    let hasMoved = false;
    let frameQueued = false;
    let nextX = sx;
    let nextY = sy;

    const applyTransform = () => {
      frameQueued = false;
      if (bubbleRef.current) {
        bubbleRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      }
      pendingPosRef.current = { x: nextX, y: nextY };
    };

    const onMove = (clientX: number, clientY: number) => {
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (!hasMoved && Math.hypot(dx, dy) > 3) hasMoved = true;
      nextX = clamp(sx + dx, 8, vw - btnSize - 8);
      nextY = clamp(sy + dy, 8, vh - btnSize - 8);
      if (!frameQueued) {
        frameQueued = true;
        requestAnimationFrame(applyTransform);
      }
    };
    const onEnd = () => {
      setIsDragging(false);
      const latest = pendingPosRef.current ?? { x: sx, y: sy };
      pendingPosRef.current = null;
      if (hasMoved) {
        setBtnPos(latest);
        persistBtnPos(latest);
        // Reset alignment to 'right' (default) when moving button manually, 
        // to simplify UX, OR keep distinct. Let's keep distinct to avoid jumping.
      } else if (!open) { toggleChat(); }
    };
    return { onMove, onEnd };
  };

  // Drag Panel
  const startDragPanel = (startX: number, startY: number) => {
    setIsDragging(true);
    const startPanel = getPanelPos();
    let hasMoved = false;
    let frameQueued = false;
    let nextX = startPanel.x;
    let nextY = startPanel.y;

    const applyTransform = () => {
      frameQueued = false;
      if (panelRef.current) {
        panelRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      }
      pendingPanelPosRef.current = { x: nextX, y: nextY };
    };

    const onMove = (clientX: number, clientY: number) => {
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (!hasMoved && Math.hypot(dx, dy) > 3) hasMoved = true;
      nextX = clamp(startPanel.x + dx, 8, vw - panelWidth - 8);
      nextY = clamp(startPanel.y + dy, 8, vh - panelHeight - 8);
      if (!frameQueued) {
        frameQueued = true;
        requestAnimationFrame(applyTransform);
      }
    };
    const onEnd = () => {
      setIsDragging(false);
      const latest = pendingPanelPosRef.current ?? startPanel;
      pendingPanelPosRef.current = null;
      if (hasMoved) {
        // Calculate best button position and alignment based on new panel position
        const pX = latest.x;
        const pY = latest.y;

        // Try 'right' align (Panel to right of button => Button to left of Panel)
        const btnX_right_align = pX - gap - btnSize;
        // Try 'left' align (Panel to left of button => Button to right of Panel)
        const btnX_left_align = pX + panelWidth + gap;

        let newAlign: 'left' | 'right' = panelAlign;
        let newBtnX = btnPos.x;

        if (btnX_right_align < 8) {
          // Button would be off-screen left -> Force Left Align (Button on Right)
          newAlign = 'left';
          newBtnX = btnX_left_align;
        } else if (btnX_left_align > vw - btnSize - 8) {
          // Button would be off-screen right -> Force Right Align (Button on Left)
          newAlign = 'right';
          newBtnX = btnX_right_align;
        } else {
          // Both valid, prefer keeping current alignment unless we specifically want to switch?
          // To ensure stability, calculate if we need to move the button to match the panel
          if (panelAlign === 'right') {
            newBtnX = btnX_right_align;
          } else {
            newBtnX = btnX_left_align;
          }
        }

        // Clamp final button pos
        newBtnX = clamp(newBtnX, 8, vw - btnSize - 8);
        const newBtnY = clamp(pY, 8, vh - btnSize - 8);

        setBtnPos({ x: newBtnX, y: newBtnY });
        persistBtnPos({ x: newBtnX, y: newBtnY });
        persistPanelAlign(newAlign);
      }
    };
    return { onMove, onEnd };
  };

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as Element | null;
    try { el && (el as any).setPointerCapture?.(e.pointerId); } catch { }
    const { onMove, onEnd } = startDragBubble(e.clientX, e.clientY);
    const moveHandler = (ev: PointerEvent) => onMove(ev.clientX, ev.clientY);
    const upHandler = (ev: PointerEvent) => {
      onEnd();
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', upHandler);
      window.removeEventListener('pointercancel', upHandler);
      try { el && (el as any).releasePointerCapture?.(e.pointerId); } catch { }
    };
    window.addEventListener('pointermove', moveHandler, { passive: true });
    window.addEventListener('pointerup', upHandler, { passive: true });
    window.addEventListener('pointercancel', upHandler, { passive: true });
  };

  const handlePanelPointerDown = (e: React.PointerEvent) => {
    if (isMobile) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.chat-panel-header')) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as Element | null;
    try { el && (el as any).setPointerCapture?.(e.pointerId); } catch { }
    const { onMove, onEnd } = startDragPanel(e.clientX, e.clientY);
    const moveHandler = (ev: PointerEvent) => onMove(ev.clientX, ev.clientY);
    const upHandler = (ev: PointerEvent) => {
      onEnd();
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', upHandler);
      window.removeEventListener('pointercancel', upHandler);
      try { el && (el as any).releasePointerCapture?.(e.pointerId); } catch { }
    };
    window.addEventListener('pointermove', moveHandler, { passive: true });
    window.addEventListener('pointerup', upHandler, { passive: true });
    window.addEventListener('pointercancel', upHandler, { passive: true });
  };

  const panelPos = getPanelPos();

  // --- 5. OTHER UTILS (RESIZING, FILE DROP, RENDER) ---

  const autoResizeTextarea = (el: HTMLTextAreaElement) => {
    try {
      el.style.height = 'auto';
      const styles = window.getComputedStyle(el);
      const lineHeight = parseFloat(styles.lineHeight || '20');
      const maxH = lineHeight * 5;
      const newH = Math.min(el.scrollHeight, maxH);
      el.style.height = `${newH}px`;
      el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
      setIsMultiline(newH > lineHeight * 1.6);
    } catch { }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await ChatAPI.remove(id, token);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setActiveMenu(null);
    } catch { }
  };

  const handleHide = (id: string) => {
    setHiddenMessages(prev => {
      const newSet = new Set(prev);
      newSet.add(id);
      return newSet;
    });
    setActiveMenu(null);
  };

  const handleUnhide = (id: string) => {
    setHiddenMessages(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const handleLongPressStart = (msgId: string) => {
    const timer = setTimeout(() => { setActiveMenu(msgId); }, 500);
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
  };

  const renderAttachment = (m: ChatMessage) => {
    if (!m.attachmentUrl) return null;
    const API_BASE = getApiBaseUrl().replace(/\/$/, "");
    const primaryUrl = m.attachmentUrl.startsWith("http") ? m.attachmentUrl : `${API_BASE}${m.attachmentUrl}`;
    const fallbackUrl = m.attachmentUrl;

    if (m.attachmentType === "image") {
      return (
        <a href={primaryUrl} target="_blank" rel="noreferrer">
          <img
            src={primaryUrl}
            alt="attachment"
            className="max-h-48 rounded-lg"
            onError={(e) => { const img = e.currentTarget as HTMLImageElement; if (img.src !== fallbackUrl) img.src = fallbackUrl; }}
          />
        </a>
      );
    }
    if (m.attachmentType === "video") {
      return (
        <video controls preload="metadata" className="max-h-60 rounded-lg bg-black/10">
          <source
            src={primaryUrl}
            onError={(e) => {
              const source = e.currentTarget as HTMLSourceElement;
              if (source.src !== fallbackUrl) {
                source.src = fallbackUrl;
                const video = source.parentElement as HTMLVideoElement | null;
                video?.load();
              }
            }}
          />
        </video>
      );
    }
    const fileUrl = primaryUrl;
    let fileName = (m.attachmentUrl.split("/").pop() || "Tệp").split("?")[0];
    try {
      fileName = decodeURIComponent(fileName);
    } catch (e) {
      // Ignore error if already decoded or invalid
    }

    const isMine = m.userId === currentUserId;

    return (
      <a
        href={fileUrl}
        className={`inline-flex items-center gap-2 hover:underline break-all ${isMine ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}
        target="_blank"
        rel="noreferrer"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M8 2a2 2 0 00-2 2v9a2 2 0 002 2h4a2 2 0 002-2V8l-4-4H8z" /></svg>
        <span className="truncate max-w-[14rem]" title={fileName}>{fileName}</span>
      </a>
    );
  };

  // Drag & Drop File
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (!open) return;
      e.preventDefault();
      const hasImage = Array.from(e.dataTransfer?.items || []).some(item => item.type.startsWith("image/"));
      if (hasImage) setIsDraggingFile(true);
    };
    const handleDragLeave = (e: DragEvent) => { if (!open) return; e.preventDefault(); setIsDraggingFile(false); };
    const handleDrop = (e: DragEvent) => {
      if (!open) return;
      e.preventDefault();
      setIsDraggingFile(false);
      const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith("image/"));
      if (files.length) setFile(files[0]);
    };
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [open]);

  // Messages Render Logic with Grouping
  const messagesToRender = messages; // Show all messages, blur hidden ones instead of filtering

  const messagesWithGrouping = messagesToRender.map((m, index) => {
    const prevMessage = index > 0 ? messagesToRender[index - 1] : null;
    const nextMessage = index < messagesToRender.length - 1 ? messagesToRender[index + 1] : null;

    // Date separator logic
    let showDateSeparator = false;
    if (!prevMessage) {
      showDateSeparator = true;
    } else {
      const currentDate = new Date(m.createdAt);
      const prevDate = new Date(prevMessage.createdAt);
      const isSameDay =
        currentDate.getFullYear() === prevDate.getFullYear() &&
        currentDate.getMonth() === prevDate.getMonth() &&
        currentDate.getDate() === prevDate.getDate();
      if (!isSameDay) showDateSeparator = true;
    }

    // Calculate time differences (in minutes)
    let timeDiffPrev = 0;
    if (prevMessage && prevMessage.userId === m.userId) {
      const current = new Date(m.createdAt).getTime();
      const prev = new Date(prevMessage.createdAt).getTime();
      timeDiffPrev = (current - prev) / 1000 / 60;
    }

    let timeDiffNext = 0;
    if (nextMessage && nextMessage.userId === m.userId) {
      const next = new Date(nextMessage.createdAt).getTime();
      const current = new Date(m.createdAt).getTime();
      timeDiffNext = (next - current) / 1000 / 60;
    }

    // Grouping logic with 5-minute threshold
    // Start group if: no prev, different user, date separator, OR time gap > 5 mins
    const isGroupStart = !prevMessage || prevMessage.userId !== m.userId || showDateSeparator || timeDiffPrev > 5;

    // End group if: no next, different user, OR time gap > 5 mins
    const isGroupEnd = !nextMessage || nextMessage.userId !== m.userId || timeDiffNext > 5;

    // Avatar logic (keep existing behavior or adjust if needed)
    // Original logic: timeDiff > 2 mins -> showAvatar. 
    // Now we can align it with isGroupEnd or keep separate. 
    // Let's keep it simple: show avatar at the end of the group.
    // If we split groups > 5 mins, that 'end' becomes a visual break, so showing avatar there makes sense.
    let showAvatar = isGroupEnd;

    // Check strict time gap for avatar specifically if we want to keep the "2 minutes" rule from before alongside key grouping?
    // The user requirement says "tách nhẹ ra... tách biệt thời gian 5 phút ra".
    // So if isGroupEnd is true (either diff user or > 5 mins), we show avatar.
    // The original code had: if (nextMessage && nextMessage.userId === m.userId) { ... if (timeDiff > 2) showAvatar = true; }
    // My new isGroupEnd covers > 5 mins. 
    // If the user wants to keep the "2 minute" avatar logic even if not fully separated, we could add:
    // but usually "end of group" implies avatar. 
    // I will stick to showAvatar = isGroupEnd to ensure consistency with the new visual Separation.

    return { ...m, showDateSeparator, isGroupStart, isGroupEnd, showAvatar };
  });

  // Avatar component
  const Avatar = ({ user }: { user?: { id: string; name?: string | null; email: string; avatarUrl?: string | null } }) => {
    if (!user) return null;
    return (
      <a
        href={user.avatarUrl || userAvatar}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-8 h-8 rounded-full overflow-hidden shadow-md flex-shrink-0 hover:opacity-90 transition-opacity cursor-pointer"
        title="Nhấp để xem avatar"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={user.avatarUrl || userAvatar} alt="Avatar" className="w-full h-full object-cover" />
      </a>
    );
  };

  const panel = (
    <>
      {/* Backdrop for mobile */}
      {isMobile && open && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9997]"
          onClick={closeChat}
        />
      )}



      {/* Floating button */}
      {!open && (!hideOnDesktop || vw < 1280) && vw >= 1024 && (
        <button
          ref={bubbleRef}
          onPointerDown={handlePointerDown}
          className={`flex items-center justify-center rounded-full shadow-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white hover:from-primary-600 hover:to-primary-800 focus:outline-none ${isDragging ? 'cursor-grabbing scale-110' : 'cursor-grab hover:scale-110 transition-all'
            } ${isMobile ? 'w-14 h-14' : 'w-[60px] h-[60px]'}`}
          aria-label="Mở chat"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            transform: `translate3d(${btnPos.x}px, ${btnPos.y}px, 0)`,
            zIndex: 9999,
            touchAction: 'none',
            userSelect: 'none',
            willChange: 'transform'
          }}
        >
          <FaCommentDots className={isMobile ? 'w-6 h-6' : 'w-7 h-7'} />
          {unread > 0 && (
            <span
              className="min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white"
              style={{ position: 'absolute', top: '-6px', right: '-6px' }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      <div
        ref={panelRef}
        onPointerDown={handlePanelPointerDown}
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } ${isMobile ? 'border-0' : 'border border-slate-200 dark:border-slate-700'}`}
        style={{
          position: 'fixed',
          transition: isDragging ? 'none' : 'opacity 200ms ease-in-out, transform 200ms ease-in-out',
          transform: `translate3d(${panelPos.x}px, ${panelPos.y}px, 0) ${open ? '' : 'scale(0.95)'}`,
          left: 0,
          top: 0,
          width: `${panelWidth}px`,
          height: `${panelHeight}px`,
          zIndex: 9998
        }}
      >
        {/* Header */}
        <div className={`chat-panel-header flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-md select-none ${!isMobile && 'cursor-grab active:cursor-grabbing'
          }`} style={{ touchAction: 'none' }}>
          <div className="flex items-center gap-3 pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <FaCommentDots className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold text-base">Cộng đồng Liêm Đại Hiệp</div>
              <div className="text-xs text-white/80">
                {onlineCount === null ? 'Đang hoạt động' : `Đang hoạt động: ${onlineCount}`}
              </div>
            </div>
          </div>
          <button
            onClick={closeChat}
            aria-label="Đóng"
            className="w-9 h-9 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors pointer-events-auto no-drag leading-none"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          className="chat-scroll flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-800"
          style={{ userSelect: 'text' }}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop < 40) loadOlder();
          }}
        >

          {messagesWithGrouping.map((m) => {
            const mine = currentUserId === m.userId;

            return (
              <React.Fragment key={m.id}>
                {m.showDateSeparator && (
                  <div className="text-center py-2">
                    <span className="inline-block px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 rounded-full shadow-sm">
                      {formatDateSeparator(m.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  className={`flex ${mine ? 'justify-end' : 'justify-start'} group ${m.isGroupStart ? 'mt-4' : 'mt-1'}`}
                >
                  {/* Avatar - only for others and only on last message in group */}
                  {!mine && (
                    <div className="w-8 mr-2 flex flex-col justify-end">
                      {m.showAvatar ? <Avatar user={m.user} /> : <div className="w-8 h-8"></div>}
                    </div>
                  )}

                  <div
                    className="relative max-w-[75%]"
                  >
                    {!isMobile && (
                      <>
                        {/* 3-dot menu button - close to bubble */}
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity ${mine ? '-left-10' : '-right-10'
                            }`}
                          style={{ zIndex: 10000 }}
                        >
                          <div className="relative">
                            <button
                              onClick={() => setActiveMenu(activeMenu === m.id ? null : m.id)}
                              className="p-1.5 rounded-full bg-white dark:bg-slate-700 shadow-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600"
                            >
                              <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="12" cy="19" r="2" />
                              </svg>
                            </button>

                            {activeMenu === m.id && (
                              <div
                                ref={menuRef}
                                className={`absolute top-1/2 -translate-y-1/2 ${mine ? 'right-full mr-2' : 'left-full ml-2'
                                  } bg-white dark:bg-slate-700 rounded-lg shadow-xl border border-slate-200 dark:border-slate-600 z-20 flex whitespace-nowrap`}
                              >
                                {mine ? (
                                  <button
                                    onClick={() => handleDelete(m.id)}
                                    className="px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-2 text-red-600 dark:text-red-400 rounded-lg"
                                    title="Xóa"
                                  >
                                    <FiTrash2 className="w-4 h-4" />
                                    <span>Xóa</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => hiddenMessages.has(m.id) ? handleUnhide(m.id) : handleHide(m.id)}
                                    className="px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-2 text-slate-700 dark:text-slate-200 rounded-lg"
                                    title={hiddenMessages.has(m.id) ? "Hiện tin nhắn" : "Ẩn tin nhắn"}
                                  >
                                    <FiEyeOff className="w-4 h-4" />
                                    <span>{hiddenMessages.has(m.id) ? 'Hiện' : 'Ẩn'}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    <div
                      onTouchStart={() => handleLongPressStart(m.id)}
                      onTouchEnd={handleLongPressEnd}
                      onTouchMove={handleLongPressEnd}
                      className={`shadow-sm ${mine
                        ? `bg-gradient-to-br from-primary-500 to-primary-600 text-white ${m.isGroupStart && m.isGroupEnd
                          ? 'rounded-2xl rounded-br-md' // Standalone message
                          : m.isGroupStart
                            ? 'rounded-2xl rounded-br-md' // First in group
                            : m.isGroupEnd
                              ? 'rounded-2xl rounded-tr-md rounded-br-md' // Last in group
                              : 'rounded-2xl rounded-tr-md rounded-br-md' // Middle in group
                        }`
                        : `bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600 ${m.isGroupStart && m.isGroupEnd
                          ? 'rounded-2xl rounded-bl-md' // Standalone message
                          : m.isGroupStart
                            ? 'rounded-2xl rounded-bl-md' // First in group
                            : m.isGroupEnd
                              ? 'rounded-2xl rounded-tl-md rounded-bl-md' // Last in group
                              : 'rounded-2xl rounded-tl-md rounded-bl-md' // Middle in group
                        }`
                        } px-3 py-2 cursor-text ${hiddenMessages.has(m.id) ? 'relative blur-sm opacity-50 cursor-pointer' : ''}`}
                      onClick={hiddenMessages.has(m.id) ? () => handleUnhide(m.id) : undefined}
                      title={hiddenMessages.has(m.id) ? "Nhấn để hiện lại" : undefined}
                    >
                      {!mine && m.isGroupStart && (
                        <div className="text-xs font-semibold text-primary-600 dark:text-primary-400 mb-2">
                          {m.user?.name || m.user?.email?.split("@")[0] || 'Người dùng'}
                        </div>
                      )}

                      {m.content && (
                        <div className="text-sm whitespace-pre-wrap break-words select-text">{renderMessageContent(m.content, mine)}</div>
                      )}

                      {renderAttachment(m)}

                      {m.isGroupEnd && (
                        <div className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                          {new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>

                    {isMobile && activeMenu === m.id && (
                      <div
                        ref={menuRef}
                        className={`absolute ${mine ? 'right-0' : 'left-0'} mt-1 bg-white dark:bg-slate-700 rounded-lg shadow-xl border border-slate-200 dark:border-slate-600 z-20 flex whitespace-nowrap`}
                      >
                        {mine ? (
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-2 text-red-600 dark:text-red-400 rounded-lg"
                            title="Xóa"
                          >
                            <FiTrash2 className="w-4 h-4" />
                            <span>Xóa</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => hiddenMessages.has(m.id) ? handleUnhide(m.id) : handleHide(m.id)}
                            className="px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-2 text-slate-700 dark:text-slate-200 rounded-lg"
                            title={hiddenMessages.has(m.id) ? "Hiện tin nhắn" : "Ẩn tin nhắn"}
                          >
                            <FiEyeOff className="w-4 h-4" />
                            <span>{hiddenMessages.has(m.id) ? 'Hiện' : 'Ẩn'}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {messagesWithGrouping.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-8">
              <svg className="w-12 h-12 mx-auto mb-2 opacity-50" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              Chưa có tin nhắn
            </div>
          )}

        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            Array.from(items).forEach((item) => {
              if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                  setFile(file);
                  e.preventDefault();
                }
              }
            });
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer?.files?.[0];
            if (file && file.type.startsWith("image/")) {
              setFile(file);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          style={{ userSelect: 'text' }}
        >
          {file && (
            <div className="mb-2 flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="ml-2 text-red-600 hover:text-red-700 text-xs font-medium"
              >
                Bỏ chọn
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className={`flex-1 flex items-center gap-2 bg-slate-100 dark:bg-slate-800 ${isMultiline ? 'rounded-xl' : 'rounded-full'} px-4 py-2 border border-slate-200 dark:border-slate-700`}>
              <label className="cursor-pointer text-primary-600 hover:text-primary-700 dark:text-primary-400">
                <FiPaperclip className="w-5 h-5" />
                <input
                  type="file"
                  hidden
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <textarea
                ref={inputRef}
                className="input-scroll flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none"
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResizeTextarea(e.currentTarget); }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    if (!isMobile && !e.shiftKey) {
                      e.preventDefault();
                      await doSend();
                      return;
                    }
                  }
                  requestAnimationFrame(() => { if (inputRef.current) autoResizeTextarea(inputRef.current); });
                }}
                rows={1}
                maxLength={2000}
                enterKeyHint={isMobile ? 'enter' : 'send'}
                placeholder="Aa"
                style={{ height: 'auto', overflowY: 'hidden' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || (!input.trim() && !file)}
              className="w-10 h-10 rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white shadow-md transition-all hover:shadow-lg leading-none"
              title="Gửi"
              aria-label="Gửi"
            >
              <FiSend className="w-5 h-5 block" />
            </button>
          </div>
        </form>
      </div>
    </>
  );

  return createPortal(panel, document.body);
};

export default React.memo(ChatBox);