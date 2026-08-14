'use client';

import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { api } from '@/lib/api';
import { MessageSquare, Send, Bot, Hand, ArrowLeft, Archive, ArchiveRestore, RefreshCw, Menu } from 'lucide-react';
import styles from './page.module.css';

type ConversationStatus = 'open' | 'pending_human' | 'closed';

export default function InboxPage() {
  const [allConversations, setAllConversations] = useState<any[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [convStatus, setConvStatus] = useState<string>('');
  const [filter, setFilter] = useState<ConversationStatus | ''>('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [togglingAI, setTogglingAI] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesWrapRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const lastMessageTimeRef = useRef<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const convPollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const viewportBox = useInboxViewportLock();

  function scrollMessagesToBottom(smooth = false) {
    const wrap = messagesWrapRef.current;
    if (!wrap) return;
    wrap.scrollTo({ top: wrap.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  // Derived: client-side filtered conversations (instant)
  const conversations = useMemo(() => {
    const source = showArchived ? archivedConversations : allConversations;
    if (!filter) return source;
    return source.filter((c: any) => c.status === filter);
  }, [allConversations, archivedConversations, showArchived, filter]);

  const archivedCount = archivedConversations.length;

  // Fetch all conversations (both active + archived) once, then poll
  useEffect(() => {
    fetchAll();
    convPollTimerRef.current = setInterval(fetchAll, 5000);
    return () => { if (convPollTimerRef.current) clearInterval(convPollTimerRef.current); };
  }, []);

  // Deep link: /dashboard/inbox?c=<conversationId>
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c');
    if (c) setSelectedId(c);
  }, []);

  // Load messages when selecting a conversation + start polling
  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (selectedId) {
      loadMessages(selectedId);
      pollTimerRef.current = setInterval(() => pollNewMessages(selectedId), 3000);
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [selectedId]);

  useEffect(() => {
    scrollMessagesToBottom(false);
  }, [messages]);

  async function fetchAll() {
    try {
      const [active, archived] = await Promise.all([
        api.getConversations({}),
        api.getConversations({ archived: 'true' }),
      ]);
      setAllConversations(active.conversations);
      setArchivedConversations(archived.conversations);
      setLoading(false);
    } catch (err) {
      console.error('Error loading conversations:', err);
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const data = await api.getConversation(conversationId);
      setMessages(data.conversation.messages);
      setConvStatus(data.conversation.status);
      const lastMsg = data.conversation.messages[data.conversation.messages.length - 1];
      lastMessageTimeRef.current = lastMsg?.createdAt || null;
      // Al abrir, el backend marca leído → sincronizar lista local
      setAllConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, hasUnread: false, needsAttention: false, unreadCount: 0 } : c)),
      );
      setArchivedConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, hasUnread: false, needsAttention: false, unreadCount: 0 } : c)),
      );
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }

  async function pollNewMessages(conversationId: string) {
    if (!lastMessageTimeRef.current) return;
    try {
      const data = await api.pollMessages(conversationId, lastMessageTimeRef.current);
      if (data.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m: any) => m.id));
          const newMsgs = data.messages.filter((m: any) => !existingIds.has(m.id));
          if (newMsgs.length === 0) return prev;
          const updated = [...prev, ...newMsgs];
          lastMessageTimeRef.current = updated[updated.length - 1].createdAt;
          return updated;
        });
      }
      if (data.status !== convStatus) {
        setConvStatus(data.status);
        fetchAll();
      }
    } catch (err) {
      // Silent fail on poll
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !inputText.trim() || sending) return;
    setSending(true);
    try {
      const result = await api.sendAgentMessage(selectedId, inputText.trim());
      setMessages((prev) => [...prev, result.message]);
      lastMessageTimeRef.current = result.message.createdAt;
      setInputText('');
      if (result.aiPaused) {
        setConvStatus('pending_human');
        fetchAll();
      }
    } catch (err: any) {
      alert('Error enviando: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleToggleAI() {
    if (!selectedId || togglingAI) return;
    setTogglingAI(true);
    try {
      const newEnabled = convStatus !== 'open';
      const result = await api.toggleAI(selectedId, newEnabled);
      setConvStatus(result.conversation.status);
      fetchAll();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTogglingAI(false);
    }
  }

  async function handleResetContext(conversationId: string) {
    if (!confirm('¿Resetear el contexto de esta conversación? El bot va a "olvidar" el resumen acumulado y responder solo con los últimos mensajes.')) return;
    try {
      await api.resetConversationContext(conversationId);
      alert('Contexto reseteado. El bot va a responder con las guardrails actualizadas.');
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleArchive(conversationId: string) {
    try {
      await api.archiveConversation(conversationId);
      await fetchAll();
      setSelectedId(null);
      setMessages([]);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleUnarchive(conversationId: string) {
    try {
      await api.unarchiveConversation(conversationId);
      await fetchAll();
      setSelectedId(null);
      setMessages([]);
    } catch (err: any) {
      alert(err.message);
    }
  }

  const selectedConv = conversations.find((c: any) => c.id === selectedId);
  const isAIActive = convStatus === 'open';

  function getBadgeClass(status: string) {
    switch (status) {
      case 'open': return styles.badgeOpen;
      case 'pending_human': return styles.badgePendingHuman;
      case 'closed': return styles.badgeClosed;
      default: return '';
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'open': return 'Bot activo';
      case 'pending_human': return 'Atención humana';
      case 'closed': return 'Cerrada';
      default: return status;
    }
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function isSameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function formatDayLabel(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

    if (isSameDay(d, now)) {
      return `Hoy · ${d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })}`;
    }
    if (isSameDay(d, yesterday)) {
      return `Ayer · ${d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })}`;
    }

    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 1 && diffDays < 7) {
      const weekday = cap(d.toLocaleDateString('es-AR', { weekday: 'long' }));
      const dayMonth = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' });
      return `${weekday} · ${dayMonth}`;
    }
    if (d.getFullYear() === now.getFullYear()) {
      const weekday = cap(d.toLocaleDateString('es-AR', { weekday: 'long' }));
      const dayMonth = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' });
      return `${weekday} · ${dayMonth}`;
    }
    const weekday = cap(d.toLocaleDateString('es-AR', { weekday: 'long' }));
    const fullDate = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    return `${weekday} · ${fullDate}`;
  }

  return (
    <div
      className={styles.wrapper}
      style={viewportBox.height ? { height: viewportBox.height, maxHeight: viewportBox.height } : undefined}
    >
      <div className={styles.shell}>
        <div className={`${styles.container} ${selectedId ? styles.mobileChatOpen : ''}`}>
      {/* Conversation list */}
      <div className={styles.conversationList}>
        <div className={styles.listHeader}>
          <button
            type="button"
            className={styles.navMenuBtn}
            onClick={() => window.dispatchEvent(new Event('volt:open-nav'))}
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <h2>Inbox</h2>
          <span className={styles.liveIndicator}>EN VIVO</span>
        </div>

        {showArchived ? (
          <div className={styles.archivedHeader}>
            <button
              className={styles.archivedBackBtn}
              onClick={() => setShowArchived(false)}
            >
              <ArrowLeft size={18} />
            </button>
            <Archive size={16} />
            <span>Archivados</span>
          </div>
        ) : (
          <div className={styles.filterBar}>
            {['', 'open', 'pending_human', 'closed'].map((f) => (
              <button
                key={f}
                className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
                onClick={() => setFilter(f as any)}
              >
                {f === '' ? 'Todas' : getStatusLabel(f)}
              </button>
            ))}
          </div>
        )}

        <div className={styles.listItems}>
          {!showArchived && archivedCount > 0 && (
            <div
              className={styles.archiveBanner}
              onClick={() => { setShowArchived(true); setFilter(''); setSelectedId(null); setMessages([]); }}
            >
              <Archive size={16} />
              <span>Archivados</span>
              <span className={styles.archiveCount}>{archivedCount}</span>
            </div>
          )}
          {loading && <div className={styles.emptyState}><p>Cargando...</p></div>}
          {!loading && conversations.length === 0 && (
            <div className={styles.emptyState}><p>Sin conversaciones</p></div>
          )}
          {conversations.map((conv) => {
            const unread = Number(conv.unreadCount || 0);
            const showUnread = unread > 0 || !!conv.needsAttention;
            return (
            <div
              key={conv.id}
              className={`${styles.conversationItem} ${selectedId === conv.id ? styles.conversationItemActive : ''} ${showUnread ? styles.conversationItemUnread : ''}`}
              onClick={() => setSelectedId(conv.id)}
            >
              <div className={styles.avatar}>
                {(conv.lead?.name || conv.lead?.phone || '?')[0].toUpperCase()}
              </div>
              <div className={styles.convInfo}>
                <div className={styles.convHeader}>
                  <span className={styles.convName}>{conv.lead?.name || conv.lead?.phone}</span>
                  <span className={styles.convTime}>
                    {conv.messages?.[0] ? formatTime(conv.messages[0].createdAt) : ''}
                  </span>
                </div>
                <div className={styles.convPreviewRow}>
                  <div className={styles.convPreview}>
                    {conv.messages?.[0]?.text || 'Sin mensajes'}
                  </div>
                  {showUnread && (
                    <span className={styles.unreadBadge}>
                      {unread > 0 ? (unread > 99 ? '99+' : unread) : '!'}
                    </span>
                  )}
                </div>
                <span className={`${styles.badge} ${getBadgeClass(conv.status)}`}>
                  {getStatusLabel(conv.status)}
                </span>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div className={styles.chatArea}>
        {!selectedConv ? (
          <div className={styles.emptyState}>
            <MessageSquare size={48} />
            <p>Seleccioná una conversación</p>
          </div>
        ) : (
          <>
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderInfo}>
                <button
                  className={styles.backBtn}
                  onClick={() => { setSelectedId(null); setMessages([]); }}
                >
                  <ArrowLeft size={20} />
                </button>
                <div className={styles.avatar}>
                  {(selectedConv.lead?.name || selectedConv.lead?.phone || '?')[0].toUpperCase()}
                </div>
                <div>
                  <h3>{selectedConv.lead?.name || selectedConv.lead?.phone}</h3>
                  <span>{selectedConv.lead?.phone} &middot; {getStatusLabel(convStatus || selectedConv.status)}</span>
                </div>
              </div>
              <div className={styles.chatActions}>
                {convStatus !== 'closed' && (
                  <button
                    className={`${styles.aiToggle} ${isAIActive ? styles.aiToggleOn : styles.aiToggleOff}`}
                    onClick={handleToggleAI}
                    disabled={togglingAI}
                    title={isAIActive ? 'IA respondiendo - Click para pausar' : 'IA pausada - Click para activar'}
                  >
                    {isAIActive ? <Bot size={14} /> : <Hand size={14} />}
                    <span className={styles.actionLabel}>{isAIActive ? 'IA Activa' : 'IA Pausada'}</span>
                  </button>
                )}
                {convStatus !== 'closed' && (
                  <button className={styles.actionBtn} onClick={() => handleResetContext(selectedConv.id)} title="Resetear contexto del bot para esta conversación">
                    <RefreshCw size={14} />
                    <span className={styles.actionLabel}>Reset contexto</span>
                  </button>
                )}
                {!showArchived ? (
                  <button className={styles.actionBtn} onClick={() => handleArchive(selectedConv.id)} title="Archivar">
                    <Archive size={14} />
                  </button>
                ) : (
                  <button className={styles.actionBtn} onClick={() => handleUnarchive(selectedConv.id)} title="Desarchivar">
                    <ArchiveRestore size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* AI Status Banner */}
            {convStatus === 'pending_human' && (
              <div className={styles.aiBanner}>
                <Hand size={14} />
                <span>IA pausada - Estás respondiendo como agente. Los mensajes del cliente no serán procesados por la IA.</span>
              </div>
            )}

            <div className={styles.chatMessages} ref={messagesWrapRef}>
              {messages.map((msg, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const showDateSep =
                  !prev || !isSameDay(new Date(prev.createdAt), new Date(msg.createdAt));
                return (
                  <Fragment key={msg.id}>
                    {showDateSep && (
                      <div className={styles.dateSeparator}>
                        <span>{formatDayLabel(msg.createdAt)}</span>
                      </div>
                    )}
                    <div
                      className={`${styles.message} ${
                        msg.direction === 'in' ? styles.messageIn :
                        msg.direction === 'out' ? styles.messageOut :
                        styles.messageSystem
                      }`}
                    >
                      {msg.mediaUrl && (
                        <div className={styles.messageImage} onClick={() => setImagePreview(msg.mediaUrl)}>
                          <img src={msg.mediaUrl} alt="Imagen" loading="lazy" />
                        </div>
                      )}
                      {msg.text && msg.text !== '[📷 Foto enviada]' && msg.text}
                      {!msg.mediaUrl && msg.text === '[📷 Foto enviada]' && msg.text}
                      <div className={styles.messageTime}>{formatTime(msg.createdAt)}</div>
                    </div>
                  </Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Image preview overlay */}
            {imagePreview && (
              <div className={styles.messageImageOverlay} onClick={() => setImagePreview(null)}>
                <img src={imagePreview} alt="Preview" />
              </div>
            )}

            {/* Message input */}
            {convStatus !== 'closed' && (
              <form ref={composerRef} className={styles.messageInput} onSubmit={handleSendMessage}>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Mensaje..."
                  disabled={sending}
                  enterKeyHint="send"
                  inputMode="text"
                  autoComplete="off"
                  onFocus={() => {
                    window.dispatchEvent(new Event('inbox:keyboard'));
                    requestAnimationFrame(() => {
                      composerRef.current?.scrollIntoView({ block: 'end', inline: 'nearest' });
                    });
                  }}
                />
                <button type="submit" disabled={!inputText.trim() || sending} aria-label="Enviar">
                  <Send size={18} />
                </button>
              </form>
            )}
          </>
        )}
      </div>
        </div>
      </div>
    </div>
  );
}

function readInboxViewport() {
  const vv = window.visualViewport;
  const inner = window.innerHeight;
  const vvHeight = vv?.height ?? inner;
  const offsetTop = Math.round(vv?.offsetTop ?? 0);
  // iOS: innerHeight suele achicarse con el teclado aunque 100dvh no
  const height = Math.round(Math.min(vvHeight, inner));
  return { height, offsetTop };
}

function useInboxViewportLock() {
  const [box, setBox] = useState({ height: 0, offsetTop: 0 });

  useEffect(() => {
    const root = document.documentElement;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const apply = () => {
      const next = readInboxViewport();
      setBox(next);
      root.style.setProperty('--inbox-vv-height', `${next.height}px`);
      root.style.setProperty('--inbox-vv-top', `${next.offsetTop}px`);

      const main = document.querySelector('.dashboard-main') as HTMLElement | null;
      if (main) {
        main.style.height = `${next.height}px`;
        main.style.maxHeight = `${next.height}px`;
        main.style.top = `${next.offsetTop}px`;
      }
    };

    const startPoll = () => {
      if (pollTimer) clearInterval(pollTimer);
      let n = 0;
      pollTimer = setInterval(() => {
        apply();
        if (++n >= 16) {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
        }
      }, 50);
    };

    apply();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', startPoll);
    window.addEventListener('focusin', startPoll);
    window.addEventListener('inbox:keyboard', startPoll);

    root.classList.add('inbox-page');
    document.body.style.overflow = 'hidden';

    const vk = (navigator as Navigator & {
      virtualKeyboard?: { overlaysContent: boolean; addEventListener: Function; removeEventListener: Function };
    }).virtualKeyboard;
    if (vk) {
      vk.overlaysContent = true;
      vk.addEventListener('geometrychange', apply);
    }

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', startPoll);
      window.removeEventListener('focusin', startPoll);
      window.removeEventListener('inbox:keyboard', startPoll);
      vk?.removeEventListener('geometrychange', apply);
      root.classList.remove('inbox-page');
      root.style.removeProperty('--inbox-vv-height');
      root.style.removeProperty('--inbox-vv-top');
      document.body.style.overflow = '';
      const main = document.querySelector('.dashboard-main') as HTMLElement | null;
      if (main) {
        main.style.height = '';
        main.style.maxHeight = '';
        main.style.top = '';
      }
    };
  }, []);

  return box;
}
