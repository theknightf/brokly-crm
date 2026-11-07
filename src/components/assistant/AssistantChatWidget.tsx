'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useChat } from 'ai/react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  ExternalLink,
  MessageCircle,
  Check,
  AlertCircle,
  Trash2,
  Copy,
  CalendarClock,
  Search,
  PenLine,
  ShieldCheck,
  Mic,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useVoice } from './useVoice';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

// Starter prompts shown on the hub card and as quick chips under the conversation.
const MISSIONS: { icon: React.ReactNode; label: string; prompt: string }[] = [
  { icon: <CalendarClock size={14} />, label: 'ملخص متابعات اليوم والمتأخرة', prompt: 'هاتلي ملخص متابعات اليوم والمتأخرة' },
  { icon: <Search size={14} />, label: 'مين العميل اللي سأل عن النرجس؟', prompt: 'مين العميل اللي سأل عن النرجس؟' },
  { icon: <PenLine size={14} />, label: 'رسالة واتساب لمتابعة زيارة موقع', prompt: 'اكتبلي رسالة واتساب ودية للعميل لمتابعة زيارة موقع' },
];

const timeOf = (d?: Date) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

export default function AssistantChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<any | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const initials =
    (user?.name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p: string) => p[0])
      .join('')
      .toUpperCase() || 'ME';

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
    setInput,
    append,
    error,
  } = useChat({
    api: '/api/assistant',
    onError: (err) => {
      console.error('AI Assistant Error:', err);
      toast.error('تعذر الرد من المساعد الذكي حالياً.');
    },
  });

  // ── Voice: tap the mic, speak, and the message is sent when you stop; replies can be read aloud ──
  const [voiceReplies, setVoiceReplies] = useState(false);
  useEffect(() => {
    try {
      setVoiceReplies(localStorage.getItem('brokly:assistant-voice-replies') === '1');
    } catch {
      /* storage blocked */
    }
  }, []);
  const toggleVoiceReplies = () => {
    setVoiceReplies((v) => {
      const next = !v;
      try {
        localStorage.setItem('brokly:assistant-voice-replies', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (!next) voice.stopSpeaking();
      return next;
    });
  };

  const voice = useVoice({
    lang: 'ar-EG',
    onInterim: (text) => setInput(text),
    onFinal: (text) => {
      setInput('');
      void append({ role: 'user', content: text });
    },
    onError: (code) => {
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        toast.error('اسمح للمتصفح باستخدام الميكروفون من إعدادات الموقع.');
      } else if (code === 'unsupported') {
        toast.error('المتصفح ده مش بيدعم الكتابة بالصوت.');
      } else if (code === 'no-speech') {
        toast.message('ما سمعتش حاجة، جرّب تاني.');
      } else if (code !== 'aborted') {
        toast.error('تعذّر التسجيل الصوتي، حاول مرة أخرى.');
      }
    },
  });

  // Read the assistant's answer aloud once it has finished streaming.
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && voiceReplies) {
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant' && last.content) voice.speak(last.content);
    }
    wasLoadingRef.current = isLoading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Closing the panel stops the mic and the voice.
  useEffect(() => {
    if (!isOpen) {
      voice.stopListening();
      voice.stopSpeaking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Detect pending actions from assistant tool invocations
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolInvocations) {
      for (const invocation of lastMsg.toolInvocations) {
        if (
          invocation.state === 'result' &&
          invocation.result &&
          invocation.result.confirmationRequired
        ) {
          setPendingAction(invocation.result);
          return;
        }
      }
    }
  }, [messages]);

  const handleConfirmAction = async (actionData: any) => {
    setIsConfirming(true);
    try {
      const res = await fetch('/api/assistant/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تنفيذ الإجراء.');

      toast.success(data.message || 'تم تنفيذ الإجراء بنجاح.');
      setPendingAction(null);

      // Append assistant confirmation feedback message
      setMessages((prev) => [
        ...prev,
        {
          id: `confirmed-${Date.now()}`,
          role: 'assistant',
          content: `✅ ${data.message}`,
        },
      ]);
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء التأكيد.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelAction = () => {
    setPendingAction(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `cancelled-${Date.now()}`,
        role: 'assistant',
        content: 'تم إلغاء الإجراء ولم يتم تعديل أي بيانات.',
      },
    ]);
  };

  const clearChat = () => {
    setMessages([]);
    setPendingAction(null);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('تم النسخ');
    } catch {
      toast.error('تعذر النسخ');
    }
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="group flex items-center justify-center gap-2 h-12 w-12 hover:w-auto hover:px-4 focus-visible:w-auto focus-visible:px-4 rounded-full bg-lime-400 text-zinc-950 font-extrabold shadow-xl shadow-lime-500/20 active:scale-95 transition-all text-xs tracking-wide overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
            aria-label="Open AI Assistant"
            title="مساعد بروكلي الذكي"
          >
            <Sparkles size={18} className="flex-shrink-0" />
            <span className="hidden group-hover:inline group-focus-visible:inline whitespace-nowrap">مساعد بروكلي الذكي</span>
          </button>
        )}
      </div>

      {/* Slide-over Chat Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Brokly Copilot"
          className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full flex-col border-l border-white/10 bg-[#0B0E14] text-zinc-200 shadow-2xl animate-in slide-in-from-right duration-300 sm:w-[440px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-zinc-900/60 px-4 py-3 backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-lime-400/10 text-lime-400 ring-1 ring-lime-400/40">
                <Sparkles size={18} />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0B0E14] bg-lime-400" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-bold text-zinc-100">Brokly Copilot</h3>
                  <span className="rounded-md border border-lime-400/30 bg-lime-400/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-lime-400">
                    Pro
                  </span>
                </div>
                <span className="block truncate text-[11px] text-zinc-500">مساعد المبيعات العقاري</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                title="محادثة جديدة"
                aria-label="محادثة جديدة"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                title="إغلاق"
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 text-xs">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-md">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-lime-400/10 text-lime-400 ring-1 ring-lime-400/30">
                    <Sparkles size={20} />
                  </div>
                  <h4 className="text-base font-bold leading-snug text-zinc-100">Brokly Sales Intelligence</h4>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
                    اسألني عن متطلبات العملاء وملاحظاتهم، أو متابعات اليوم، أو اطلب صياغة رسالة واتساب جاهزة. بجيب البيانات من الـ CRM
                    نفسه ومش بخمّن.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">اقتراحات سريعة</p>
                  {MISSIONS.map((m) => (
                    <button
                      key={m.label}
                      type="button"
                      onClick={() => setInput(m.prompt)}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 px-3 text-start text-[12px] font-medium text-zinc-200 transition-all duration-200 hover:border-lime-400/50 hover:bg-zinc-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                    >
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-lime-400/10 text-lime-400">
                        {m.icon}
                      </span>
                      <span className="flex-1">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div key={m.id} className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className={`flex items-center gap-2 px-1 text-[10px] text-zinc-500 ${isUser ? 'flex-row-reverse' : ''}`}>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold ${
                          isUser ? 'bg-zinc-700 text-zinc-100' : 'bg-lime-400/10 text-lime-400 ring-1 ring-lime-400/30'
                        }`}
                      >
                        {isUser ? initials : <Sparkles size={11} />}
                      </span>
                      <span className="font-semibold text-zinc-400">{isUser ? user?.name || 'أنت' : 'Brokly Copilot'}</span>
                      {timeOf((m as any).createdAt) && <span>{timeOf((m as any).createdAt)}</span>}
                    </div>

                    {m.content && (
                      <div
                        dir="auto"
                        className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed ${
                          isUser
                            ? 'rounded-te-sm bg-zinc-800 text-zinc-100'
                            : 'rounded-ts-sm border border-white/10 bg-zinc-900/70 text-zinc-200'
                        }`}
                      >
                        {m.content}
                        {!isUser && (
                          <div className="mt-2.5 flex justify-end border-t border-white/5 pt-2">
                            <button
                              type="button"
                              onClick={() => copyText(m.content)}
                              className="flex min-h-[32px] items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-lime-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                            >
                              <Copy size={12} /> نسخ
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tool Output Details & Action Buttons (Lead Card / WhatsApp) */}
                    {m.toolInvocations?.map((inv) => {
                      if (inv.state !== 'result' || !inv.result) return null;
                      const res = inv.result;

                      if (res.leads && Array.isArray(res.leads)) {
                        return (
                          <div key={inv.toolCallId} className="w-full max-w-[92%] space-y-2">
                            {res.leads.map((lead: any) => (
                              <div
                                key={lead.leadId}
                                className="space-y-2.5 rounded-2xl border border-white/10 bg-zinc-900/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-sm font-bold text-zinc-100">{lead.name}</span>
                                  <span className="flex-shrink-0 rounded-full border border-lime-400/30 bg-lime-400/10 px-2 py-0.5 text-[10px] font-semibold text-lime-400">
                                    {lead.status || 'Active'}
                                  </span>
                                </div>

                                {lead.matchingSnippet && (
                                  <p dir="auto" className="rounded-lg bg-white/[0.03] p-2 text-[11px] leading-relaxed text-zinc-400">
                                    📝 &quot;{lead.matchingSnippet}&quot;
                                  </p>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                  {lead.whatsappUrl && (
                                    <a
                                      href={lead.whatsappUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-lime-400 px-3 text-[12px] font-bold text-zinc-950 shadow-lg shadow-lime-500/10 transition-all hover:bg-lime-300 active:scale-[0.98]"
                                    >
                                      <MessageCircle size={14} />
                                      <span>واتساب</span>
                                    </a>
                                  )}
                                  <Link
                                    href={lead.openUrl || `/leads-management?lead=${lead.leadId}`}
                                    className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800/60 px-3 text-[12px] font-semibold text-zinc-200 transition-all hover:border-lime-400/50 hover:bg-zinc-800"
                                  >
                                    <ExternalLink size={14} />
                                    <span>عرض العميل</span>
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                );
              })
            )}

            {/* Pending Write Action Preview Card */}
            {pendingAction && (
              <div className="space-y-2.5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3.5 animate-in fade-in">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <AlertCircle size={16} />
                  <span>تأكيد الإجراء المطلوب</span>
                </div>
                <p dir="auto" className="text-[12px] font-medium leading-relaxed text-zinc-200">
                  {pendingAction.message}
                </p>

                {pendingAction.text && (
                  <div dir="auto" className="rounded-lg border border-white/10 bg-zinc-900/70 p-2 font-mono text-[11px] text-zinc-400">
                    &quot;{pendingAction.text}&quot;
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={handleCancelAction}
                    disabled={isConfirming}
                    className="min-h-[40px] rounded-lg px-3 text-[12px] font-semibold text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-white"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={() => handleConfirmAction(pendingAction)}
                    disabled={isConfirming}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-lime-400 px-4 text-[12px] font-extrabold text-zinc-950 transition-all hover:bg-lime-300 active:scale-95 disabled:opacity-60"
                  >
                    {isConfirming ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    <span>تأكيد وتنفيذ</span>
                  </button>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex items-center gap-2 px-1 py-1 text-[11px] text-zinc-400" role="status">
                <Loader2 size={14} className="animate-spin text-lime-400" />
                <span>جاري البحث والتحليل...</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-[11px] text-red-300" role="alert">
                <AlertCircle size={14} className="shrink-0" />
                <span dir="auto">حدث خطأ في استلام الرد. {error.message ? `(${error.message.slice(0, 200)})` : null}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts while chatting */}
          {messages.length > 0 && (
            <div className="custom-scrollbar flex gap-2 overflow-x-auto border-t border-white/5 px-3 py-2">
              {MISSIONS.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => setInput(m.prompt)}
                  className="flex min-h-[36px] flex-shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-all hover:border-lime-400/50 hover:text-lime-400"
                >
                  <span className="text-lime-400">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Message Input Box */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-white/5 bg-zinc-900/60 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md"
          >
            {voice.supportsSpeaking && (
              <button
                type="button"
                onClick={voice.speaking ? voice.stopSpeaking : toggleVoiceReplies}
                aria-pressed={voiceReplies}
                aria-label={voice.speaking ? 'إيقاف القراءة' : voiceReplies ? 'إيقاف قراءة الردود بصوت' : 'قراءة الردود بصوت'}
                title={voice.speaking ? 'إيقاف القراءة' : voiceReplies ? 'الردود بصوت: شغّال' : 'الردود بصوت: مقفول'}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border transition-colors active:scale-95 ${
                  voiceReplies || voice.speaking
                    ? 'border-lime-400/50 bg-lime-400/10 text-lime-400'
                    : 'border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {voice.speaking ? <Square size={14} /> : voiceReplies ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            )}
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder={voice.listening ? 'بسمعك... اتكلم دلوقتي' : 'اكتب سؤالك أو طلبك هنا...'}
              disabled={isLoading}
              dir="auto"
              aria-label="رسالة للمساعد"
              className="min-h-[44px] flex-1 rounded-full border border-zinc-800 bg-zinc-900/80 px-4 text-base text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-lime-400/80 focus:outline-none focus:ring-1 focus:ring-lime-400 sm:text-sm"
            />
            {voice.supportsListening && (
              <button
                type="button"
                onClick={voice.listening ? voice.stopListening : voice.startListening}
                disabled={isLoading}
                aria-pressed={voice.listening}
                aria-label={voice.listening ? 'إيقاف التسجيل' : 'تحدّث بالصوت'}
                title={voice.listening ? 'إيقاف التسجيل' : 'تحدّث بالصوت'}
                className={`relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border transition-all active:scale-95 disabled:opacity-40 ${
                  voice.listening
                    ? 'border-red-400/60 bg-red-500/15 text-red-300'
                    : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-lime-400/50 hover:text-lime-400'
                }`}
              >
                {voice.listening && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-red-400/20" aria-hidden />
                )}
                <Mic size={16} className="relative" />
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="إرسال"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-lime-400 text-zinc-950 shadow-lg shadow-lime-500/10 transition-all hover:bg-lime-300 active:scale-95 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </form>
          <p className="flex items-center justify-center gap-1.5 bg-zinc-900/60 px-3 pb-2 text-center text-[10px] text-zinc-600">
            <ShieldCheck size={11} /> قد تحتوي الردود على أخطاء، راجع البيانات قبل أي إجراء.
          </p>
        </div>
      )}
    </>
  );
}
