'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  User,
  Bot,
  Mic,
  MicOff,
  Zap,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

export default function AssistantChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<any | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke('ask-brokly', {
        body: { question: trimmed },
      });

      if (fnError || !data) {
        let errorMsg = 'تعذر الرد من المساعد الذكي حالياً.';
        if (fnError) {
          try {
            const errContext = (fnError as any).context;
            const parsed = typeof errContext?.json === 'function' ? await errContext.json() : null;
            if (process.env.NODE_ENV === 'development') {
              errorMsg = parsed?.error || fnError.message || errorMsg;
            }
          } catch {
            if (process.env.NODE_ENV === 'development') {
              errorMsg = fnError.message || errorMsg;
            }
          }
        }
        throw new Error(errorMsg);
      }

      const botMsg = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer || '',
        toolInvocations: data.leads && data.leads.length > 0 ? [{
          state: 'result',
          toolCallId: `call-${Date.now()}`,
          result: { leads: data.leads }
        }] : [],
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      console.error('AI Assistant Error:', err);
      const isDev = process.env.NODE_ENV === 'development';
      const displayMsg = isDev
        ? (err?.message || 'حدث خطأ في استلام الرد. برجاء المحاولة مجدداً.')
        : 'حدث خطأ في استلام الرد. برجاء المحاولة مجدداً.';
      setError(displayMsg);
      toast.error(displayMsg, {
        duration: 3000,
        id: 'assistant-error-toast',
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${displayMsg}`,
          timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendMessage(input);
  };

  // Clean up speech recognition on close or unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      return;
    }

    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('التعرف على الصوت غير مدعوم في هذا المتصفح.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'ar-EG'; // Egyptian Arabic dialect
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListening(true);
        toast.info('تحدث الآن بالعامية المصرية...');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          toast.error('يرجى السماح بالوصول إلى الميكروفون لاستخدام الإملاء الصوتي.');
        } else if (event.error !== 'no-speech') {
          toast.error('تعذر التقاط الصوت، يرجى المحاولة ثانية.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
      toast.error('تعذر تشغيل الميكروفون.');
    }
  };

  // Scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

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

      setMessages((prev) => [
        ...prev,
        {
          id: `confirmed-${Date.now()}`,
          role: 'assistant',
          content: `✅ ${data.message}`,
          timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
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
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const clearChat = () => {
    setMessages([]);
    setPendingAction(null);
    setError(null);
  };

  return (
    <>
      {/* ========================================================
          FLOATING LAUNCHER BUTTON — LUXURY EMBLEM ORB
          ======================================================== */}
      <div
        className="fixed bottom-20 sm:bottom-24 right-5 sm:right-6 z-50 flex items-center"
        style={{
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#0b0e14]/90 backdrop-blur-xl border border-primary/40 text-white shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_20px_rgba(163,230,53,0.25)] hover:border-primary hover:shadow-[0_12px_40px_rgba(0,0,0,0.8),0_0_28px_rgba(163,230,53,0.4)] hover:scale-105 active:scale-95 transition-all duration-300"
            aria-label="Open AI Assistant"
          >
            {/* Ambient subtle backglow */}
            <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-primary/30 via-lime-400/20 to-primary/30 blur-sm opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none" />

            {/* Glowing Icon Orb */}
            <span className="relative w-7 h-7 rounded-full bg-gradient-to-tr from-primary to-lime-300 text-black flex items-center justify-center font-bold shadow-[0_0_12px_rgba(163,230,53,0.6)] shrink-0">
              <Sparkles size={14} className="animate-pulse" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-[#0b0e14] animate-ping" />
            </span>

            {/* Title & Badge */}
            <span className="relative flex flex-col text-right">
              <span className="text-xs font-black tracking-wide bg-gradient-to-r from-white via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
                Brokly AI Copilot
              </span>
              <span className="text-[9px] font-mono text-primary font-semibold flex items-center gap-1 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                المساعد الذكي العقاري
              </span>
            </span>
          </button>
        )}
      </div>

      {/* ========================================================
          SLIDE-OVER LUXURY INTELLIGENCE SUITE PANEL
          ======================================================== */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-[#0c1017]/95 dark:bg-[#0c1017]/95 text-zinc-100 border-l border-zinc-800/80 shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col backdrop-blur-2xl transition-all duration-300 animate-in slide-in-from-right overflow-hidden">
          {/* Subtle Ambient Radial Lighting in Background */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-20 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* ================= HEADER BAR ================= */}
          <header
            className="relative z-10 flex items-center justify-between px-4 py-3.5 border-b border-zinc-800/70 bg-[#090d14]/80 backdrop-blur-xl shrink-0"
            style={{
              paddingTop: 'max(env(safe-area-inset-top, 0px) + 0.75rem, 1.25rem)',
            }}
          >
            {/* Brand Emblem & Model Info */}
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 rounded-xl p-0.5 bg-gradient-to-br from-primary/60 via-zinc-700 to-zinc-900 shadow-[0_0_16px_rgba(163,230,53,0.3)] flex items-center justify-center shrink-0">
                <div className="w-full h-full rounded-[10px] bg-[#0b0e14] flex items-center justify-center text-primary">
                  <Bot size={18} />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full border-2 border-[#0b0e14] shadow-[0_0_6px_#a3e635]" />
              </div>
              <div className="flex flex-col text-right">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white tracking-wide">مساعد بروكلي الذكي</h3>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider uppercase bg-primary/15 text-primary border border-primary/30">
                    Copilot
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Groq Speed • Real Estate AI
                </span>
              </div>
            </div>

            {/* Action Buttons: Clear & Close */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all active:scale-95 border border-transparent hover:border-zinc-700/60"
                title="محادثة جديدة"
                aria-label="New Chat"
              >
                <RotateCcw size={15} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all active:scale-95 border border-transparent hover:border-zinc-700/60"
                title="إغلاق النافذة"
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>
          </header>

          {/* ================= CHAT CONVERSATION STREAM ================= */}
          <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-4 text-xs scrollbar-thin scrollbar-thumb-zinc-800">
            {messages.length === 0 ? (
              /* Welcome Luxury Intelligence Hub Card */
              <div className="py-4 space-y-4 text-right">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-900/80 via-zinc-900/40 to-transparent border border-zinc-800/80 p-4.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3 mb-3">
                    <div className="flex items-center gap-2 text-primary font-bold text-xs">
                      <Sparkles size={16} />
                      <span>مركز الذكاء العقاري الفوري</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25">
                      جاهز للعمل
                    </span>
                  </div>

                  <h4 className="font-bold text-white text-sm leading-snug">
                    أهلاً بك! إزاي أقدر أساعدك النهاردة؟
                  </h4>
                  <p className="text-zinc-400 text-[11px] leading-relaxed mt-1">
                    اسألني عن رغبات العملاء وملاحظاتهم، ملخص متابعات اليوم المتأخرة، أو اطلب صياغة رسائل واتساب بيعية مخصصة.
                  </p>
                </div>

                {/* Prompt Missions Bento */}
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold block px-1">
                    مهام سريعة مقترحة:
                  </span>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => sendMessage('مين العميل اللي سأل عن النرجس؟')}
                      className="group flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-primary/50 text-zinc-300 hover:text-white transition-all text-right shadow-sm active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                          <Zap size={13} />
                        </span>
                        <span className="text-[11px] font-medium">مين العميل اللي سأل عن النرجس؟</span>
                      </div>
                      <ArrowRight size={13} className="text-zinc-500 group-hover:text-primary transition-colors" />
                    </button>

                    <button
                      onClick={() => sendMessage('هاتلي ملخص متابعات اليوم والمتابعات المتأخرة')}
                      className="group flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-primary/50 text-zinc-300 hover:text-white transition-all text-right shadow-sm active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                          <TrendingUp size={13} />
                        </span>
                        <span className="text-[11px] font-medium">هاتلي ملخص متابعات اليوم والمتأخرة</span>
                      </div>
                      <ArrowRight size={13} className="text-zinc-500 group-hover:text-primary transition-colors" />
                    </button>

                    <button
                      onClick={() => sendMessage('اكتبلي رسالة واتساب ودية للعميل لمتابعة زيارة موقع')}
                      className="group flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-primary/50 text-zinc-300 hover:text-white transition-all text-right shadow-sm active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-lime-500/10 text-lime-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                          <MessageCircle size={13} />
                        </span>
                        <span className="text-[11px] font-medium">اكتبلي رسالة واتساب لمتابعة زيارة موقع</span>
                      </div>
                      <ArrowRight size={13} className="text-zinc-500 group-hover:text-primary transition-colors" />
                    </button>

                    <button
                      onClick={() => sendMessage('آخر عميل أنا كلمته مهتم وعاوز يشتري في العبور')}
                      className="group flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-primary/50 text-zinc-300 hover:text-white transition-all text-right shadow-sm active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                          <ShieldCheck size={13} />
                        </span>
                        <span className="text-[11px] font-medium">آخر عميل كلمته مهتم وعاوز يشتري في العبور</span>
                      </div>
                      <ArrowRight size={13} className="text-zinc-500 group-hover:text-primary transition-colors" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex gap-2.5 ${isUser ? 'flex-row-reverse text-left' : 'flex-row text-right'}`}
                  >
                    {/* Role Avatar */}
                    <div
                      className={`w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center text-[11px] font-bold shadow-md ${
                        isUser
                          ? 'bg-zinc-800 border border-zinc-700 text-zinc-200'
                          : 'bg-primary/20 border border-primary/40 text-primary'
                      }`}
                    >
                      {isUser ? <User size={14} /> : <Bot size={14} />}
                    </div>

                    {/* Bubble Content */}
                    <div className="space-y-2 max-w-[86%]">
                      {/* Metadata label */}
                      <div
                        className={`flex items-center gap-1.5 px-1 text-[10px] font-mono text-zinc-400 ${
                          isUser ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <span>{isUser ? 'أنت' : 'Brokly AI'}</span>
                        {m.timestamp && <span>• {m.timestamp}</span>}
                      </div>

                      {/* Main Message Bubble */}
                      <div
                        className={`p-3.5 rounded-2xl leading-relaxed whitespace-pre-wrap text-xs shadow-md transition-all ${
                          isUser
                            ? 'bg-gradient-to-br from-zinc-800 to-zinc-850 text-white border border-zinc-700/80 rounded-tr-none'
                            : 'bg-zinc-900/90 text-zinc-200 border border-zinc-800 rounded-tl-none'
                        }`}
                      >
                        {m.content}
                      </div>

                      {/* Tool Output Details & Action Buttons (Interactive Bento Lead Cards) */}
                      {m.toolInvocations?.map((inv: any) => {
                        if (inv.state !== 'result' || !inv.result) return null;
                        const res = inv.result;

                        if (res.leads && Array.isArray(res.leads)) {
                          return (
                            <div key={inv.toolCallId} className="space-y-2.5 pt-1">
                              {res.leads.map((lead: any) => (
                                <div
                                  key={lead.leadId}
                                  className="relative overflow-hidden p-3.5 rounded-xl bg-gradient-to-br from-[#0e131d] to-[#121824] border border-primary/25 hover:border-primary/50 space-y-2.5 text-right shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all"
                                >
                                  {/* Lead Header */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                      <span className="font-bold text-white text-xs">{lead.name}</span>
                                    </div>
                                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                                      {lead.status || 'Active'}
                                    </span>
                                  </div>

                                  {/* Matched Requirement Snippet */}
                                  {lead.matchingSnippet && (
                                    <div className="text-[11px] text-zinc-300 bg-zinc-950/70 border border-zinc-800/80 p-2.5 rounded-lg leading-relaxed font-sans">
                                      <span className="text-primary font-bold font-mono">المطابقة: </span>
                                      "{lead.matchingSnippet}"
                                    </div>
                                  )}

                                  {/* Quick Actions Row */}
                                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/60">
                                    {lead.whatsappUrl && (
                                      <a
                                        href={lead.whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                      >
                                        <MessageCircle size={13} />
                                        <span>واتساب</span>
                                      </a>
                                    )}
                                    <Link
                                      href={lead.openUrl || `/leads-management?leadId=${lead.leadId}`}
                                      className="px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 text-[10px] font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                    >
                                      <ExternalLink size={13} />
                                      <span>عرض ملف العميل</span>
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
                  </div>
                );
              })
            )}

            {/* Pending Write Action Preview Card (Luxury Gold Confirmation) */}
            {pendingAction && (
              <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-b from-amber-950/25 via-zinc-900/90 to-zinc-900 border border-amber-500/40 text-right space-y-3 shadow-[0_8px_30px_rgba(0,0,0,0.6)] animate-in fade-in">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <AlertCircle size={16} />
                  <span>تأكيد الإجراء المطلوب قبل التنفيذ</span>
                </div>
                <p className="text-zinc-200 text-[11px] font-medium leading-relaxed whitespace-pre-line">
                  {pendingAction.message}
                </p>

                {/* Structured details for compound update */}
                {pendingAction.action === 'update_lead_stage_and_add_note' && (
                  <div className="space-y-2 pt-1">
                    {pendingAction.newStage && (
                      <div className="flex items-center justify-end gap-2 text-[11px]">
                        <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-bold font-mono">
                          {pendingAction.newStage}
                        </span>
                        <span className="text-zinc-400">المرحلة الجديدة:</span>
                      </div>
                    )}
                    {pendingAction.noteText && (
                      <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-300 text-right leading-relaxed font-sans">
                        "{pendingAction.noteText}"
                      </div>
                    )}
                  </div>
                )}

                {pendingAction.text && pendingAction.action !== 'update_lead_stage_and_add_note' && (
                  <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-300">
                    "{pendingAction.text}"
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/80">
                  <button
                    onClick={handleCancelAction}
                    disabled={isConfirming}
                    className="px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700 text-[11px] font-semibold transition-all"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={() => handleConfirmAction(pendingAction)}
                    disabled={isConfirming}
                    className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-primary to-lime-400 text-black font-extrabold text-[11px] flex items-center gap-1.5 shadow-[0_0_16px_rgba(163,230,53,0.4)] hover:brightness-110 active:scale-95 transition-all"
                  >
                    {isConfirming ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    <span>تأكيد وتنفيذ في النظام</span>
                  </button>
                </div>
              </div>
            )}

            {/* Neural Loading Indicator */}
            {isLoading && (
              <div className="flex items-center gap-2.5 text-zinc-400 text-[11px] py-2 px-1">
                <div className="w-5 h-5 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                  <Loader2 size={13} className="animate-spin" />
                </div>
                <span className="font-mono">جاري المعالجة والبحث في بيانات CRM...</span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/30 text-red-400 text-[11px] flex items-center gap-2 shadow-sm">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ================= FOOTER / INPUT BAR ================= */}
          <footer
            className="relative z-10 p-3 border-t border-zinc-800/80 bg-[#090d14]/90 backdrop-blur-2xl"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 0.6rem, 0.85rem)',
            }}
          >
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              {/* Voice Input Mic Button */}
              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={isLoading}
                title={isListening ? 'إيقاف الاستماع' : 'إملاء صوتي بالعامية المصرية'}
                className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center shrink-0 border ${
                  isListening
                    ? 'bg-red-600 text-white animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.7)] ring-2 ring-red-400 border-red-500'
                    : 'bg-zinc-900/90 text-zinc-400 hover:text-white hover:bg-zinc-800 border-zinc-800 active:scale-95'
                }`}
                aria-label="Voice Input"
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>

              {/* Text Input Field */}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  placeholder={
                    isListening
                      ? 'جاري الاستماع... تحدث بالعامية المصرية'
                      : 'اسأل عن العملاء، الملاحظات، أو أحدث المبيعات...'
                  }
                  disabled={isLoading}
                  dir="auto"
                  className="w-full py-2.5 px-3.5 bg-zinc-900/90 border border-zinc-800 focus:border-primary/80 focus:ring-2 focus:ring-primary/20 rounded-xl text-xs text-white placeholder:text-zinc-500 focus:outline-none transition-all shadow-inner"
                />
              </div>

              {/* Send Button */}
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="p-2.5 rounded-xl bg-gradient-to-r from-primary to-lime-400 text-black font-extrabold hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-[0_0_16px_rgba(163,230,53,0.3)] shrink-0"
                aria-label="Send Message"
              >
                <Send size={16} />
              </button>
            </form>
          </footer>
        </div>
      )}
    </>
  );
}
