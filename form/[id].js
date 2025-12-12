import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/router";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""; // read-only anon key
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function FormPage() {
  const router = useRouter();
  const { id } = router.query;
  const [form, setForm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    if (!id) return;

    async function fetchForm() {
      const { data: formData } = await supabase
        .from("forms")
        .select("*")
        .eq("id", id)
        .single();

      const { data: qData } = await supabase
        .from("questions")
        .select("*")
        .eq("form_id", id)
        .order("order", { ascending: true });

      setForm(formData);
      setQuestions(qData || []);
    }

    fetchForm();
  }, [id]);

  const handleChange = (qId, value) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const handleSubmit = async () => {
    await supabase.from("responses").insert([{ form_id: id, response: answers }]);
    alert("Thanks! Your responses were submitted.");
    setAnswers({});
  };

  if (!form) return <p>Loading form...</p>;
  if (!questions.length) return <p>No questions available.</p>;

  return (
    <div style={{ maxWidth: "600px", margin: "auto", padding: "20px", fontFamily: "sans-serif" }}>
      <h1>{form.title}</h1>
      {form.description && <p>{form.description}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        {questions.map((q) => (
          <div key={q.id} style={{ marginBottom: "20px" }}>
            <label style={{ fontWeight: "bold" }}>{q.question_text}</label>
            {q.question_type === "text" && (
              <input
                type="text"
                required={q.required}
                value={answers[q.id] || ""}
                onChange={(e) => handleChange(q.id, e.target.value)}
                style={{ display: "block", width: "100%", padding: "8px", marginTop: "6px" }}
              />
            )}
            {q.question_type === "single_choice" &&
              JSON.parse(q.options).map((opt) => (
                <div key={opt}>
                  <label>
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      required={q.required}
                      onChange={(e) => handleChange(q.id, e.target.value)}
                    />
                    {opt}
                  </label>
                </div>
              ))}
          </div>
        ))}
        <button type="submit" style={{ padding: "10px 20px" }}>
          Submit
        </button>
      </form>
    </div>
  );
}
