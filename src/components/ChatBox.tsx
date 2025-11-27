import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getToken } from "../utils/auth";
import { ChatAPI, getApiBaseUrl } from "../utils/api";
import { FiPaperclip, FiSend, FiTrash2, FiEyeOff } from "react-icons/fi";

interface ChatMessage {
  id: string;
  userId: string;
  content?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: "image" | "video" | "file" | null;
  createdAt: string;
  user?: { id: string; name?: string | null; email: string };
  replyTo?: string | null;
  hidden?: boolean;
  showDateSeparator?: boolean;
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

  if (isSameDay(date, now)) {
    return "Hôm nay";
  }
  if (isSameDay(date, yesterday)) {
    return "Hôm qua";
  }

  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Helper utility
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const ChatBox = () => {
  // --- 1. STATE & REF ---
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [isMultiline, setIsMultiline] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hiddenMessages, setHiddenMessages] = useState<Set<string>>(new Set());
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [btnPos, setBtnPos] = useState({ x: 20, y: 20 });
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  // Viewport dimensions
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1000);
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [isMobile, setIsMobile] = useState(false);

  // Refs
  const openRef = useRef(open);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingPosRef = useRef<{ x: number, y: number } | null>(null);
  const pendingPanelPosRef = useRef<{ x: number, y: number } | null>(null);

  // Constants
  const btnSize = isMobile ? 56 : 60;
  const gap = 16;
  const panelWidth = isMobile ? vw : 350;
  const panelHeight = isMobile ? vh : 500;
  const token = getToken();

  // Fake currentUserId (Bạn cần thay thế logic này bằng user ID thật từ AuthContext của bạn)
  const currentUserId = "current_user_id_placeholder";

  // --- 2. LOGIC CƠ BẢN ---

  // Sync openRef
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lấy vị trí ban đầu của panel
  const getPanelPos = () => {
    if (isMobile) return { x: 0, y: 0 };
    return { x: vw - panelWidth - 20, y: vh - panelHeight - 20 };
  };

  const persistBtnPos = (pos: { x: number, y: number }) => {
    localStorage.setItem('chat_btn_pos', JSON.stringify(pos));
  };

  const closeChat = () => { if (openRef.current) setOpen(false); };

  const toggleChat = () => setOpen((v) => {
    const nv = !v;
    if (nv) setUnread(0);
    return nv;
  });

  // --- 3. LOGIC POLLING (TỰ ĐỘNG CẬP NHẬT) ---

  // 3.1. Polling tin nhắn mới (Chỉ chạy khi Chat đang mở)
  useEffect(() => {
    if (!open || !token) return;

    let isCancelled = false;

    const fetchNewMessages = async () => {
      // Nếu tab trình duyệt đang ẩn, không cần poll để tiết kiệm tài nguyên
      if (document.hidden) return;

      try {
        // Lấy thời gian của tin nhắn cuối cùng để chỉ tải tin mới hơn
        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        const afterParam = lastMsg ? lastMsg.createdAt : undefined;

        // Gọi API
        const newMsgs = await ChatAPI.list({
          limit: 20,
          after: afterParam
        }, token);

        if (!isCancelled && newMsgs && newMsgs.length > 0) {
          setMessages(prev => {
            // Lọc trùng lặp bằng ID để an toàn
            const existingIds = new Set(prev.map(m => m.id));
            const uniqueNew = newMsgs.filter((m: ChatMessage) => !existingIds.has(m.id));

            if (uniqueNew.length === 0) return prev;

            // Nối tin nhắn mới vào cuối danh sách
            return [...prev, ...uniqueNew];
          });

          // Tự động cuộn xuống dưới cùng nếu người dùng đang ở gần đáy
          if (listRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = listRef.current;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
            if (isNearBottom) {
              setTimeout(() => {
                listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
              }, 100);
            }
          }
        }
      } catch (error) {
        // Silent error (không log để tránh rác console)
      }
    };

    // Gọi lần đầu ngay khi mở
    fetchNewMessages();

    // Thiết lập chu kỳ 3 giây/lần
    const intervalId = setInterval(fetchNewMessages, 3000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [open, messages, token]);

  // 3.2. Polling số tin chưa đọc (Chỉ chạy khi Chat đóng)
  useEffect(() => {
    if (open || !token) return;

    const fetchUnread = async () => {
      try {
        const res = await ChatAPI.getUnreadCount(token);
        setUnread(res.count);
      } catch (e) { }
    };

    // Chu kỳ chậm hơn: 10 giây/lần
    const intervalId = setInterval(fetchUnread, 10000);
    fetchUnread(); // Gọi ngay

    return () => clearInterval(intervalId);
  }, [open, token]);

  // 3.3. Load tin nhắn cũ (Khi cuộn lên trên)
  const loadOlder = async () => {
    if (loading || messages.length === 0) return;
    // Logic load thêm tin nhắn cũ (Todo: Implement based on 'before' param)
    // Hiện tại giữ placeholder để tránh lỗi
    console.log("Load older messages...");
  };

  // --- 4. GỬI TIN NHẮN ---

  const doSend = async () => {
    if ((!input.trim() && !file) || !token) return;
    setLoading(true);
    try {
      await ChatAPI.send({ content: input, file: file || undefined }, token);

      // Clear input ngay lập tức cho trải nghiệm mượt (tin nhắn sẽ hiện sau khi Polling chạy - max 3s)
      // Hoặc tối ưu hơn: Tự thêm tin nhắn ảo vào state ngay tại đây (Optimistic UI)
      setInput("");
      setFile(null);
      setIsMultiline(false);
      if (inputRef.current) inputRef.current.style.height = 'auto';

      // Gọi poll ngay lập tức để hiện tin nhắn vừa gửi
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      const newMsgs = await ChatAPI.list({ limit: 1, after: lastMsg?.createdAt }, token);
      if (newMsgs && newMsgs.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const uniqueNew = newMsgs.filter((m: ChatMessage) => !existingIds.has(m.id));
          return [...prev, ...uniqueNew];
        });
        setTimeout(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
        }, 100);
      }

    } catch (e) {
      console.error(e);
      alert("Gửi tin nhắn thất bại");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSend();
  };

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

  // --- 5. CÁC HÀM XỬ LÝ KHÁC (XÓA, ẨN, KÉO THẢ) ---

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
    const timer = setTimeout(() => {
      setActiveMenu(msgId);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const renderAttachment = (m: ChatMessage) => {
    if (!m.attachmentUrl) return null;
    const API_BASE = getApiBaseUrl().replace(/\/$/, "");
    const primaryUrl = m.attachmentUrl.startsWith("http")
      ? m.attachmentUrl
      : `${API_BASE}${m.attachmentUrl}`;
    const fallbackUrl = m.attachmentUrl;

    if (m.attachmentType === "image") {
      return (
        <a href={primaryUrl} target="_blank" rel="noreferrer">
          <img
            src={primaryUrl}
            alt="attachment"
            className="max-h-48 rounded-lg"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (img.src !== fallbackUrl) img.src = fallbackUrl;
            }}
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
    const fileName = (m.attachmentUrl.split("/").pop() || "Tệp").split("?")[0];
    return (
      <a
        href={fileUrl}
        className="inline-flex items-center gap-2 text-blue-600 hover:underline break-all"
        target="_blank"
        rel="noreferrer"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M8 2a2 2 0 00-2 2v9a2 2 0 002 2h4a2 2 0 002-2V8l-4-4H8z" />
        </svg>
        <span className="truncate max-w-[14rem]" title={fileName}>{fileName}</span>
      </a>
    );
  };

  // --- DRAG & DROP LOGIC ---
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
      if (hasMoved) { setBtnPos(latest); persistBtnPos(latest); } else if (!open) { toggleChat(); }
    };
    return { onMove, onEnd };
  };

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
        const nx = clamp(latest.x - btnSize - gap, 8, vw - btnSize - 8);
        const ny = clamp(latest.y, 8, vh - btnSize - 8);
        setBtnPos({ x: nx, y: ny });
        persistBtnPos({ x: nx, y: ny });
      }
    };
    return { onMove, onEnd };
  };

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

  // Drag & Drop File
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (!open) return;
      e.preventDefault();
      const hasImage = Array.from(e.dataTransfer?.items || []).some(item => item.type.startsWith("image/"));
      if (hasImage) setIsDraggingFile(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!open) return;
      e.preventDefault();
      setIsDraggingFile(false);
    };

    const handleDrop = (e: DragEvent) => {
      if (!open) return;
      e.preventDefault();
      setIsDraggingFile(false);
      const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith("image/"));
      if (files.length) {
        setFile(files[0]);
      }
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

  const messagesToRender = messages.filter(m => !hiddenMessages.has(m.id));

  const messagesWithDateSeparator = messagesToRender.map((m, index) => {
    const prevMessage = index > 0 ? messagesToRender[index - 1] : null;
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

      if (!isSameDay) {
        showDateSeparator = true;
      }
    }

    return { ...m, showDateSeparator };
  });

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
      {!open && !isMobile && (
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
          <svg className={isMobile ? 'w-6 h-6' : 'w-7 h-7'} viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
          {unread > 0 && (
            <span
              className="min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white"
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px'
              }}
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
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
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

        {/* Messages List */}
        <div
          ref={listRef}
          className="chat-scroll flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50 dark:bg-slate-800"
          style={{ userSelect: 'text' }}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop < 40) loadOlder();
          }}
        >

          {messagesWithDateSeparator.map((m) => {
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
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'} group`}>
                  <div className="relative max-w-[75%]">
                    {!isMobile && (
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 ${mine ? '-left-10' : '-right-10'
                          }`}
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
                    )}

                    <div
                      onTouchStart={() => handleLongPressStart(m.id)}
                      onTouchEnd={handleLongPressEnd}
                      onTouchMove={handleLongPressEnd}
                      className={`rounded-2xl shadow-sm ${mine
                        ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-br-md'
                        : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-bl-md'
                        } px-3 py-3 cursor-text ${hiddenMessages.has(m.id) ? 'relative' : ''}`}
                    >
                      {hiddenMessages.has(m.id) && (
                        <div
                          onClick={() => handleUnhide(m.id)}
                          className={`absolute inset-0 ${mine ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'} bg-white/30 dark:bg-slate-900/30 backdrop-blur-md border border-white/40 dark:border-white/10 flex items-center justify-center cursor-pointer select-none`}
                          title="Nhấn để hiện lại"
                          role="button"
                        >
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-xs font-medium">
                            <FiEyeOff className="w-4 h-4" />
                            <span>Tin nhắn đã ẩn — Nhấn để hiện lại</span>
                          </div>
                        </div>
                      )}

                      {!mine && (
                        <div className="text-xs font-semibold text-primary-600 dark:text-primary-400 mb-3">
                          {m.user?.name || m.user?.email?.split("@")[0] || 'Người dùng'}
                        </div>
                      )}

                      {m.content && (
                        <div className="text-sm whitespace-pre-wrap break-words select-text">{m.content}</div>
                      )}

                      {renderAttachment(m)}

                      <div className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                        {new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
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

          {messagesWithDateSeparator.length === 0 && (
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
              <label className="cursor-pointer text-primary-600 hover:text-primary-700 dark:text-primary-400">
                <FiPaperclip className="w-5 h-5" />
                <input
                  type="file"
                  hidden
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
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