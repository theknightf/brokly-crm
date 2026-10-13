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
  User,
  Bot,
  Calendar,
  FileText,
  Clock,
  ArrowRight,
  Mic,
  MicOff,
  Tag
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function AssistantChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<any | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
    error,
    reload,
    setInput,
  } = useChat({
    api: '/api/assistant',
    onError: (err) => {
      console.error('AI Assistant Error:', err);
      toast.error('تعذر الرد من المساعد الذكي حالياً.');
    },
  });

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
          if (typeof setInput === 'function') {
            setInput(transcript);
          } else {
            handleInputChange({ target: { value: transcript } } as any);
          }
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

  return (
    <>
      {/* Floating Launcher Button */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-primary to-lime-500 text-black font-extrabold shadow-xl hover:scale-105 active:scale-95 transition-all text-xs tracking-wide"
            aria-label="Open AI Assistant"
          >
            <Sparkles size={18} className="animate-spin" style={{ animationDuration: '4s' }} />
            <span>مساعد بروكلي الذكي</span>
          </button>
        )}
      </div>

      {/* Slide-over Chat Panel */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-card border-l border-border shadow-2xl flex flex-col transition-all duration-300 animate-in slide-in-from-right">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-foreground">مساعد بروكلي العقاري</h3>
                <span className="text-[10px] text-muted-foreground block font-mono">
                  Gemini Free Tier • Brokly AI
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="محادثة جديدة"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="إغلاق"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {messages.length === 0 ? (
              <div className="py-8 px-2 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                  <Bot size={24} />
                </div>
                <h4 className="font-bold text-foreground text-sm">أهلاً بك! إزاي أقدر أساعدك اليوم؟</h4>
                <p className="text-muted-foreground text-[11px] leading-relaxed max-w-xs mx-auto">
                  اسألني عن متطلبات العملاء، ملاحظاتهم، متابعات اليوم، أو اطلب مني صياغة رسالة واتساب للعميل.
                </p>

                {/* Quick Prompts */}
                <div className="pt-2 flex flex-col gap-1.5 text-right font-medium">
                  <button
                    onClick={() => {
                      const evt = { target: { value: 'مين العميل اللي سأل عن النرجس؟' } } as any;
                      handleInputChange(evt);
                    }}
                    className="p-2 rounded-xl bg-muted/50 hover:bg-muted text-foreground transition-all border border-border/50 text-[11px] text-right"
                  >
                    🔍 "مين العميل اللي سأل عن النرجس؟"
                  </button>
                  <button
                    onClick={() => {
                      const evt = { target: { value: 'هاتلي ملخص متابعات اليوم والمتأخرة' } } as any;
                      handleInputChange(evt);
                    }}
                    className="p-2 rounded-xl bg-muted/50 hover:bg-muted text-foreground transition-all border border-border/50 text-[11px] text-right"
                  >
                    📅 "هاتلي ملخص متابعات اليوم والمتأخرة"
                  </button>
                  <button
                    onClick={() => {
                      const evt = { target: { value: 'اكتبلي رسالة واتساب ودية للعميل لمتابعة زيارة موقع' } } as any;
                      handleInputChange(evt);
                    }}
                    className="p-2 rounded-xl bg-muted/50 hover:bg-muted text-foreground transition-all border border-border/50 text-[11px] text-right"
                  >
                    💬 "اكتبلي رسالة واتساب ودية لمتابعة زيارة موقع"
                  </button>
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
                    <div
                      className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] ${
                        isUser
                          ? 'bg-foreground text-background'
                          : 'bg-primary/20 text-primary font-bold'
                      }`}
                    >
                      {isUser ? <User size={13} /> : <Bot size={13} />}
                    </div>

                    <div className="space-y-1.5 max-w-[85%]">
                      <div
                        className={`p-3 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-primary text-black font-semibold rounded-tr-none'
                            : 'bg-muted text-foreground border border-border rounded-tl-none'
                        }`}
                      >
                        {m.content}
                      </div>

                      {/* Tool Output Details & Action Buttons (Lead Card / WhatsApp) */}
                      {m.toolInvocations?.map((inv) => {
                        if (inv.state !== 'result' || !inv.result) return null;
                        const res = inv.result;

                        if (res.leads && Array.isArray(res.leads)) {
                          return (
                            <div key={inv.toolCallId} className="space-y-2 pt-1">
                              {res.leads.map((lead: any) => (
                                <div
                                  key={lead.leadId}
                                  className="p-2.5 rounded-xl bg-card border border-border space-y-1.5 text-right shadow-sm"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-foreground">{lead.name}</span>
                                    <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                      {lead.status || 'Active'}
                                    </span>
                                  </div>

                                  {lead.matchingSnippet && (
                                    <p className="text-[11px] text-muted-foreground bg-muted/40 p-1.5 rounded">
                                      📝 "{lead.matchingSnippet}"
                                    </p>
                                  )}

                                  <div className="flex items-center justify-end gap-2 pt-1">
                                    {lead.whatsappUrl && (
                                      <a
                                        href={lead.whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[10px] font-bold flex items-center gap-1 transition-all"
                                      >
                                        <MessageCircle size={12} />
                                        <span>واتساب</span>
                                      </a>
                                    )}
                                    <Link
                                      href={lead.openUrl || `/leads-management?leadId=${lead.leadId}`}
                                      className="px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 text-[10px] font-bold flex items-center gap-1 transition-all"
                                    >
                                      <ExternalLink size={12} />
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
                  </div>
                );
              })
            )}

            {/* Pending Write Action Preview Card */}
            {pendingAction && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-right space-y-2.5 animate-in fade-in">
                <div className="flex items-center gap-1.5 text-amber-500 font-bold text-xs">
                  <AlertCircle size={16} />
                  <span>تأكيد الإجراء المطلوب</span>
                </div>
                <p className="text-foreground text-[11px] font-medium leading-relaxed whitespace-pre-line">
                  {pendingAction.message}
                </p>

                {/* Structured details for compound update */}
                {pendingAction.action === 'update_lead_stage_and_add_note' && (
                  <div className="space-y-1.5 pt-0.5">
                    {pendingAction.newStage && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-muted-foreground">المرحلة الجديدة:</span>
                        <span className="px-2 py-0.5 rounded bg-primary/20 text-primary font-bold">
                          {pendingAction.newStage}
                        </span>
                      </div>
                    )}
                    {pendingAction.noteText && (
                      <div className="p-2 rounded bg-card border border-border text-[11px] font-mono text-muted-foreground text-right">
                        "{pendingAction.noteText}"
                      </div>
                    )}
                  </div>
                )}

                {pendingAction.text && pendingAction.action !== 'update_lead_stage_and_add_note' && (
                  <div className="p-2 rounded bg-card border border-border text-[11px] font-mono text-muted-foreground">
                    "{pendingAction.text}"
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={handleCancelAction}
                    disabled={isConfirming}
                    className="px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground text-[11px] font-semibold"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={() => handleConfirmAction(pendingAction)}
                    disabled={isConfirming}
                    className="px-4 py-1.5 rounded-lg bg-primary text-black font-extrabold text-[11px] flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all"
                  >
                    {isConfirming ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    <span>تأكيد وتنفيذ</span>
                  </button>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-[11px] py-1">
                <Loader2 size={14} className="animate-spin text-primary" />
                <span>جاري البحث والتحليل...</span>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>حدث خطأ في استلام الرد. برجاء المحاولة مجدداً.</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Box with Free Voice-to-Text Button */}
          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-border bg-card/80 backdrop-blur-sm flex items-center gap-2"
          >
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={isLoading}
              title={isListening ? 'إيقاف الاستماع' : 'إملاء صوتي بالعامية المصرية'}
              className={`p-2 rounded-xl transition-all flex items-center justify-center shrink-0 ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse shadow-md ring-2 ring-red-400'
                  : 'bg-muted/80 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95'
              }`}
            >
              {isListening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder={isListening ? 'جاري الاستماع... تحدث بالعامية المصرية' : 'اكتب سؤالك أو طلبك هنا...'}
              disabled={isLoading}
              dir="auto"
              className="flex-1 py-2 px-3 bg-muted/60 border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 rounded-xl bg-primary text-black hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all shrink-0"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
