import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `أنت "مساعد بروكلي" (Brokly AI) - المساعد الذكي لمسؤولي المبيعات والوسطاء العقاريين في مصر (Brokly CRM).
مهمتك: الإجابة بسرعة وبلهجة مصرية مهنية ومختصرة على استفسارات المبيعات والعملاء والملاحظات والعقارات.

إرشادات أساسية:
1. اعتمد فقط على البيانات الحقيقية المرفقة في السياق (Context) ولا تخمّن أو تختلق بيانات عملاء.
2. إذا سأل المستخدم عن عميل معين (مثل: "فيه عميل عايز يشتري عند الفولي؟" أو "مين مهتم بالنرجس؟"):
   - راجع قائمة العملاء والملاحظات المرفقة في السياق بدقة.
   - إذا وُجد عميل مطابق، اذكر اسمه ورقم هاتفه والمشروع/المنطقة وحالته والملاحظة المسجلة له بشكل واضح ومختصر.
   - إذا لم تجد عميلاً يطابق المتطلب، وضّح بأدب أنه لا يوجد عميل مسجل حالياً بهذه المواصفات واقترح إضافة العميل أو المتابعة.
3. تحدث بالعامية المصرية الودية والمهنية (أهلاً بك يا فندم، تمام، العميل فلان...).
4. كن مختصراً ومباشراً وقدم المعلومات المفيدة لاتخاذ إجراء سريع (واتساب/اتصال).`;

// Egyptian Arabic text normalizer & keyword extractor
function extractSearchKeywords(text: string): string[] {
  if (!text) return [];
  const stopWords = new Set([
    "مين", "مين_هو", "العميل", "عميل", "اللي", "الي", "يلي", "عاوز", "عايز", "عايزه", "عاوزه",
    "يشتري", "شراء", "محتاج", "محتاجه", "مهتم", "مهتمه", "بيدور", "بتدور", "دورلي", "ابحثلي",
    "في", "فى", "عن", "من", "على", "علي", "مع", "لو", "سمحت", "ممكن", "هاتلي", "اديني",
    "هو", "هي", "هم", "كل", "اي", "اية", "ايه", "كان", "قال", "سأل", "طلب", "بيسال", "بيسأل",
    "بكام", "كام", "فين", "شقه", "شقة", "فيلا", "وحده", "وحدة", "عند", "هل", "فيه", "فيها"
  ]);

  let cleaned = text.toLowerCase().trim();
  cleaned = cleaned.replace(/[\u064B-\u065F\u0640]/g, ""); // strip tashkeel
  cleaned = cleaned.replace(/[أإآٱ]/g, "ا");
  cleaned = cleaned.replace(/ة/g, "ه");
  cleaned = cleaned.replace(/ى/g, "ي");
  cleaned = cleaned.replace(/[^\w\s\u0600-\u06FF]/g, " ");
  cleaned = cleaned.replace(/(^|\s+)ال([^\s]{2,})/g, "$1$2");

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const keywords = tokens.filter((t) => t.length >= 2 && !stopWords.has(t));
  return keywords.length > 0 ? keywords : tokens.filter((t) => t.length >= 2);
}

// Low-level Groq API caller with automatic fallback
async function callGroqChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, status: 504, error: "Groq API request timed out (15s limit)" };
    }
    return { ok: false, status: 500, error: err?.message || "Network error" };
  }
}

Deno.serve(async (req) => {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 2. Read GROQ_API_KEY from environment secrets
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    if (!groqApiKey) {
      return new Response(
        JSON.stringify({
          error: "GROQ_API_KEY is not configured on Supabase Edge Secrets.",
          status: 500,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. User Authentication & Authorization Verification (User's own JWT)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization header.", status: 401 }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Scoped client strictly utilizing the user's JWT so Row Level Security (RLS) applies
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized: Invalid or expired authentication session.",
          status: 401,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Parse question payload
    const body = await req.json().catch(() => ({}));
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return new Response(
        JSON.stringify({ error: "Missing 'question' in request body.", status: 400 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Query relevant CRM data scoped to authenticated user & question (Limit ~10 rows)
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (userProfile?.role || "sales").toLowerCase().trim();
    const isAdmin = ["admin", "owner", "super_admin", "director", "manager"].includes(role);

    const keywords = extractSearchKeywords(question);
    const contextItems: string[] = [];

    // Query matching leads (or recent 10 leads if no specific keyword extracted)
    let leadsQuery = supabase
      .from("leads")
      .select("id, name, phone, crm_status, location, project, notes, created_at, agent")
      .order("created_at", { ascending: false })
      .limit(10);

    // Non-admin agents only see leads assigned to them
    if (!isAdmin) {
      leadsQuery = leadsQuery.eq("assigned_to", user.id);
    }

    if (keywords.length > 0) {
      const orClauses = keywords.slice(0, 4);
      const orFilter = orClauses
        .flatMap((k) => [
          `name.ilike.%${k}%`,
          `notes.ilike.%${k}%`,
          `location.ilike.%${k}%`,
          `project.ilike.%${k}%`,
          `phone.ilike.%${k}%`,
        ])
        .join(",");
      leadsQuery = leadsQuery.or(orFilter);
    }

    const { data: leads } = await leadsQuery;
    if (leads && leads.length > 0) {
      contextItems.push("=== قائمة العملاء المطابقين ===");
      for (const l of leads) {
        contextItems.push(
          `- العميل: ${l.name || "بدون اسم"} | هاتف: ${l.phone || "غير مسجل"} | الحالة: ${l.crm_status || "جديد"} | المشروع/المنطقة: ${l.project || l.location || "غير محدد"} | الملاحظات: ${l.notes || "لا توجد ملاحظات"} | المندوب: ${l.agent || "غير محدد"}`
        );
      }
    }

    // Query matching comments/notes
    if (keywords.length > 0) {
      const commentClauses = keywords
        .slice(0, 4)
        .map((k) => `body.ilike.%${k}%`)
        .join(",");

      let commentsQuery = supabase
        .from("lead_comments")
        .select("id, body, created_at, leads!inner(id, name, phone, crm_status, project, location, assigned_to)")
        .or(commentClauses)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!isAdmin) {
        commentsQuery = commentsQuery.eq("leads.assigned_to", user.id);
      }

      const { data: comments } = await commentsQuery;

      if (comments && comments.length > 0) {
        contextItems.push("\n=== أحدث الملاحظات والتعليقات المطابقة ===");
        for (const c of comments) {
          const lead = (c as any).leads;
          const leadName = lead ? lead.name : "عميل";
          const leadPhone = lead ? lead.phone : "";
          const leadStatus = lead ? lead.crm_status : "";
          contextItems.push(
            `- ملاحظة على (${leadName} - ${leadPhone} - ${leadStatus}): "${c.body}" بتاريخ ${c.created_at?.slice(0, 10)}`
          );
        }
      }
    }

    const crmContextText =
      contextItems.length > 0
        ? `\n\n[بيانات CRM الحالية ذات الصلة بالسؤال]:\n${contextItems.join("\n")}`
        : "\n\n[لم يتم العثور على عملاء أو ملاحظات مطابقة مباشرة في قاعدة البيانات]";

    // 6. Build messages payload for Groq
    const groqMessages = [
      { role: "system", content: `${SYSTEM_PROMPT}${crmContextText}` },
      { role: "user", content: question },
    ];

    // 7. Call Groq: Primary "llama-3.3-70b-versatile" -> Fallback "llama-3.1-8b-instant" -> Fallback "openai/gpt-oss-120b"
    const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b"];

    let lastError: any = null;
    let successfulData: any = null;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const result = await callGroqChat(groqApiKey, model, groqMessages);

      if (result.ok && result.data?.choices?.[0]?.message?.content) {
        successfulData = result.data;
        break;
      }

      lastError = result;
      const isRetryable =
        result.status === 404 ||
        result.status === 429 ||
        result.status >= 500 ||
        result.data?.error?.code === "model_not_found";

      if (!isRetryable) {
        break;
      }
    }

    if (!successfulData) {
      return new Response(
        JSON.stringify({
          error:
            lastError?.data?.error?.message ||
            lastError?.error ||
            "Failed to receive response from Groq AI service.",
          status: lastError?.status || 500,
          details: lastError?.data || null,
        }),
        {
          status: lastError?.status || 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const answer = successfulData.choices[0].message.content;
    const leadsFound = (leads || []).map((l: any) => ({
      leadId: l.id,
      name: l.name,
      phone: l.phone,
      status: l.crm_status,
      project: l.project || l.location || "",
      notes: l.notes || "",
    }));

    return new Response(
      JSON.stringify({
        answer,
        question,
        leads: leadsFound,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: err?.message || "Internal server error in ask-brokly edge function.",
        status: 500,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
