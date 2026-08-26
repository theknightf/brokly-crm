'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { leadCommentsService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';

interface LeadComment {
  id: string;
  body: string;
  userId: string;
  authorName: string;
  createdAt: string;
}

interface LeadCommentsSectionProps {
  leadId: string;
}

function formatTimestamp(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function LeadCommentsSection({ leadId }: LeadCommentsSectionProps) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = isAdminRole(profile?.role);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leadCommentsService.getByLead(leadId);
      setComments(data as LeadComment[]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user?.id) return;
    setSubmitting(true);
    try {
      const created = await leadCommentsService.create(leadId, text.trim(), user.id);
      setComments((prev) => [...prev, created as LeadComment]);
      setText('');
      toast.success('Comment added');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await leadCommentsService.delete(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      toast.success('Comment deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete comment');
    }
  };

  return (
    <div className="border-t border-border pt-4 mt-2">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={14} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Comments</h3>
        <span className="text-xs text-muted-foreground">({comments.length})</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-3">
          No comments yet. Add the first one below.
        </p>
      ) : (
        <ul className="space-y-3 mb-4 max-h-56 overflow-y-auto">
          {comments.map((c) => {
            const canDelete = isAdmin || c.userId === user?.id;
            const initials = c.authorName
              .split(' ')
              .map((p) => p[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);
            return (
              <li key={c.id} className="bg-muted/40 rounded-xl px-3 py-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">{c.authorName}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTimestamp(c.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap break-words">
                      {c.body}
                    </p>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="btn-ghost p-1 rounded text-muted-foreground hover:text-destructive flex-shrink-0"
                      title="Delete comment"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          className="input-base flex-1 text-sm"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="btn-primary px-3 flex items-center justify-center"
          title="Add comment"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </form>
    </div>
  );
}
