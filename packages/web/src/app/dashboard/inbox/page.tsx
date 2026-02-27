'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { MessageSquare, UserX, RotateCcw, X } from 'lucide-react';
import styles from './page.module.css';

type ConversationStatus = 'open' | 'pending_human' | 'closed';

export default function InboxPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [filter, setFilter] = useState<ConversationStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
  }, [filter]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter) params.status = filter;
      const data = await api.getConversations(params);
      setConversations(data.conversations);
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const data = await api.getConversation(conversationId);
      setMessages(data.conversation.messages);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }

  async function handleHandoff(conversationId: string) {
    try {
      await api.handoffConversation(conversationId, 'Manual handoff from panel');
      await loadConversations();
      if (selectedId === conversationId) await loadMessages(conversationId);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleReactivate(conversationId: string) {
    try {
      await api.reactivateConversation(conversationId);
      await loadConversations();
      if (selectedId === conversationId) await loadMessages(conversationId);
    } catch (err: any) {
      alert(err.message);
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

  const selectedConv = conversations.find((c) => c.id === selectedId);

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
    <div className={styles.container}>
      {/* Conversation list */}
      <div className={styles.conversationList}>
        <div className={styles.listHeader}>
          <h2>Inbox</h2>
        </div>

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
                <div className={styles.avatar}>
                  {(selectedConv.lead?.name || selectedConv.lead?.phone || '?')[0].toUpperCase()}
                </div>
                <div>
                  <h3>{selectedConv.lead?.name || selectedConv.lead?.phone}</h3>
                  <span>{selectedConv.lead?.phone} &middot; {getStatusLabel(selectedConv.status)}</span>
                </div>
              </div>
              <div className={styles.chatActions}>
                {selectedConv.status === 'open' && (
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    onClick={() => handleHandoff(selectedConv.id)}
                  >
                    <UserX size={14} /> Derivar a humano
                  </button>
                )}
                {selectedConv.status === 'pending_human' && (
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                    onClick={() => handleReactivate(selectedConv.id)}
                  >
                    <RotateCcw size={14} /> Reactivar bot
                  </button>
                )}
                {selectedConv.status !== 'closed' && (
                  <button
                    className={styles.actionBtn}
                    onClick={() => handleClose(selectedConv.id)}
                  >
                    <X size={14} /> Cerrar
                  </button>
                )}
              </div>
            </div>

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
          </>
        )}
      </div>
    </div>
  );
}
