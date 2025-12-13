import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function FormRunner() {
  const router = useRouter();
  const { id } = router.query;

  const [form, setForm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);

  // ---------------- LOAD FORM ----------------
  useEffect(() => {
    if (!id) return;

    async function load() {
      setLoading(true);

      const { data: formData, error: formErr } = await supabase
        .from("forms")
        .select("*")
        .eq("id", id)
        .single();

      if (formErr || !formData) {
        setLoading(false);
        return;
      }

      const { data: questionData } = await supabase
        .from("questions")
        .select("*")
        .eq("form_id", id)
        .order("order", { ascending: true });

      setForm(formData);
      setQuestions(questionData || []);
      setLoading(false);
    }

    load();
  }, [id]);

  // ---------------- HANDLERS ----------------
  function recordAnswer(qid, value) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }

  async function next() {
    if (index < questions.length - 1) {
      setIndex(index + 1);
    } else {
      await submit();
    }
  }

  async function submit() {
    const payload = Object.entries(answers).map(([question_id, answer]) => ({
      form_id: id,
      question_id,
      answer: String(answer),
      created_at: new Date().toISOString(),
    }));

    if (payload.length) {
      await supabase.from("responses").insert(payload);
    }

    setFinished(true);
  }

  // ---------------- STATES ----------------
  if (loading) {
    return <Center>Loading…</Center>;
  }

  if (!form) {
    return <Center>Form not found</Center>;
  }

  if (finished) {
    return (
      <Center>
        <h1>Thank you</h1>
        <p>Your response has been submitted.</p>
      </Center>
    );
  }

  if (!questions.length) {
    return <Center>No questions</Center>;
  }

  const q = questions[index];

  // ---------------- RENDER ----------------
  return (
    <Center>
      <h2 style={{ marginBottom: 20 }}>{form.title}</h2>

      <div style={card}>
        <div style={progress}>
          {index + 1} / {questions.length}
        </div>

        <h1 style={{ marginBottom: 30 }}>{q.question_text}</h1>

        {q.question_type === "text" && (
          <input
            style={input}
            autoFocus
            v
