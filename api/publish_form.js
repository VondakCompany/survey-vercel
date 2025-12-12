import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const { form } = req.body;
    if (!form || !form.id) return res.status(400).json({ error: "Missing form data" });

    const formId = form.id;

    // Upsert form meta
    await supabase
      .from("forms")
      .upsert({
        id: formId,
        title: form.title,
        description: form.description || "",
        created_at: form.created_at,
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Delete existing questions
    await supabase.from("questions").delete().eq("form_id", formId).execute();

    // Insert questions
    const slides = form.slides || [];
    for (let idx = 0; idx < slides.length; idx++) {
      const s = slides[idx];
      await supabase.from("questions").insert({
        id: s.id,
        form_id: formId,
        question_text: s.question_text,
        question_type: s.type,
        options: JSON.stringify(s.options || []),
        required: !!s.required,
        help_text: s.help_text || "",
        order: idx,
      });
    }

    const publicUrl = `https://${req.headers.host}/form/${formId}`;
    return res.status(200).json({ success: true, public_url: publicUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
