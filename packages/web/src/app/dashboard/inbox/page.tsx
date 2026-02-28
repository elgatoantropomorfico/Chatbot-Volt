'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { MessageSquare, UserX, RotateCcw, X, Send, Bot, Hand, ArrowLeft, Archive, ArchiveRestore } from 'lucide-react';
import styles from './page.module.css';

type ConversationStatus = 'open' | 'pending_human' | 'closed';

export default function InboxPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [convStatus, setConvStatus] = useState<string>('');
  const [filter, setFilter] = useState<ConversationStatus | ''>('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [togglingAI, setTogglingAI] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageTimeRef = useRef<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const convPollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Drag-to-scroll for filter pills
  const filterBarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const scrollStartX = useRef(0);
  const didDrag = useRef(false);

  function onFilterMouseDown(e: React.MouseEvent) {
    isDragging.current = true;
    didDrag.current = false;
    dragStartX.current = e.clientX;
    scrollStartX.current = filterBarRef.current?.scrollLeft || 0;
    e.preventDefault();
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current || !filterBarRef.current) return;
      const dx = e.clientX - dragStartX.current;
      if (Math.abs(dx) > 3) didDrag.current = true;
      filterBarRef.current.scrollLeft = scrollStartX.current - dx;
    }
    function onMouseUp() {
      isDragging.current = false;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Load conversations initially and set up polling
  useEffect(() => {
    loadConversations();
    convPollTimerRef.current = setInterval(loadConversations, 5000);
    return () => { if (convPollTimerRef.current) clearInterval(convPollTimerRef.current); };
  }, [filter, showArchived]);

  // Load messages when selecting a conversation + start polling
  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (selectedId) {
      loadMessages(selectedId);
      pollTimerRef.current = setInterval(() => pollNewMessages(selectedId), 3000);
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [selectedId]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    try {
      const params: Record<string, string> = {};
      if (filter) params.status = filter;
      if (showArchived) params.archived = 'true';
      const data = await api.getConversations(params);
      setConversations(data.conversations);
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
        loadConversations();
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
        loadConversations();
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
      loadConversations();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTogglingAI(false);
    }
  }

  async function handleClose(conversationId: string) {
    try {
      await api.closeConversation(conversationId);
      await loadConversations();
      setSelectedId(null);
      setMessages([]);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleArchive(conversationId: string) {
    try {
      await api.archiveConversation(conversationId);
      await loadConversations();
      setSelectedId(null);
      setMessages([]);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleUnarchive(conversationId: string) {
    try {
      await api.unarchiveConversation(conversationId);
      await loadConversations();
      setSelectedId(null);
      setMessages([]);
    } catch (err: any) {
      alert(err.message);
    }
  }

  const selectedConv = conversations.find((c) => c.id === selectedId);
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

  return (
    <div className={`${styles.container} ${selectedId ? styles.mobileChatOpen : ''}`}>
      {/* Conversation list */}
      <div className={styles.conversationList}>
        <div className={styles.listHeader}>
          <h2>Inbox</h2>
          <span className={styles.liveIndicator}>EN VIVO</span>
        </div>

        <div
          className={styles.filterBar}
          ref={filterBarRef}
          onMouseDown={onFilterMouseDown}
          style={{ cursor: 'grab' }}
        >
          {['', 'open', 'pending_human', 'closed'].map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${!showArchived && filter === f ? styles.filterBtnActive : ''}`}
              onClick={() => { if (!didDrag.current) { setFilter(f as any); setShowArchived(false); } }}
            >
              {f === '' ? 'Todas' : getStatusLabel(f)}
            </button>
          ))}
          <button
            className={`${styles.filterBtn} ${showArchived ? styles.filterBtnActive : ''}`}
            onClick={() => { if (!didDrag.current) { setShowArchived(true); setFilter(''); } }}
          >
            <Archive size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Archivados
          </button>
        </div>

        <div className={styles.listItems}>
          {loading && <div className={styles.emptyState}><p>Cargando...</p></div>}
          {!loading && conversations.length === 0 && (
            <div className={styles.emptyState}><p>Sin conversaciones</p></div>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`${styles.conversationItem} ${selectedId === conv.id ? styles.conversationItemActive : ''}`}
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
                <div className={styles.convPreview}>
                  {conv.messages?.[0]?.text || 'Sin mensajes'}
                </div>
                <span className={`${styles.badge} ${getBadgeClass(conv.status)}`}>
                  {getStatusLabel(conv.status)}
                </span>
              </div>
            </div>
          ))}
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
                {/* AI Toggle Switch */}
                {convStatus !== 'closed' && (
                  <button
                    className={`${styles.aiToggle} ${isAIActive ? styles.aiToggleOn : styles.aiToggleOff}`}
                    onClick={handleToggleAI}
                    disabled={togglingAI}
                    title={isAIActive ? 'IA respondiendo - Click para pausar' : 'IA pausada - Click para activar'}
                  >
                    {isAIActive ? <Bot size={14} /> : <Hand size={14} />}
                    {isAIActive ? 'IA Activa' : 'IA Pausada'}
                  </button>
                )}
                {convStatus !== 'closed' && (
                  <button className={styles.actionBtn} onClick={() => handleClose(selectedConv.id)}>
                    <X size={14} /> Cerrar
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

            <div className={styles.chatMessages}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.message} ${
                    msg.direction === 'in' ? styles.messageIn :
                    msg.direction === 'out' ? styles.messageOut :
                    styles.messageSystem
                  }`}
                >
                  {msg.text}
                  <div className={styles.messageTime}>{formatTime(msg.createdAt)}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            {convStatus !== 'closed' && (
              <form className={styles.messageInput} onSubmit={handleSendMessage}>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Escribí un mensaje como agente..."
                  disabled={sending}
                  autoFocus
                />
                <button type="submit" disabled={!inputText.trim() || sending}>
                  <Send size={18} />
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
