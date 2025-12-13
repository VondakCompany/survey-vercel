import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';

// ---------------------------------------------------------
// CONFIG: HARDCODED CREDENTIALS (TO PREVENT BUILD CRASHES)
// ---------------------------------------------------------
const SUPABASE_URL = "https://xrgrlfpjeovjeshebxya.supabase.co";
const SUPABASE_KEY = "sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS"; 

const supabase = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co", 
  SUPABASE_KEY || "placeholder-key"
);

export default function FormRunner() {
  const router = useRouter();
  const { id } = router.query;

  const [form, setForm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  
  const [direction, setDirection] = useState(1); 

  // Load Data
  useEffect(() => {
    if (!id) return;
    const loadForm = async () => {
      const { data: formData } = await supabase.from('forms').select('*').eq('id', id).single();
      if (formData) {
        const { data: qData } = await supabase
          .from('questions')
          .select('*')
          .eq('form_id', id)
          .order('order', { ascending: true });
        
        // --- FIX IS HERE ---
        // We map 'question_type' (from DB) to 'type' (used by UI)
        const parsedQuestions = (qData || []).map(q => ({
          ...q,
          type: q.question_type, // <--- CRITICAL FIX
          options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
        }));

        setForm(formData);
        setQuestions(parsedQuestions);
      }
    };
    loadForm();
  }, [id]);

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const currentQ = questions[currentIndex];
        if (currentQ && currentQ.type !== 'text') { 
           e.preventDefault(); 
           goNext();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, questions, answers]);

  const handleAnswer = (val) => {
    if (questions[currentIndex]) {
        setAnswers({ ...answers, [questions[currentIndex].id]: val });
    }
  };

  const goNext = () => {
    const currentQ = questions[currentIndex];
    if (currentQ.required && !answers[currentQ.id]) {
      alert("Please fill this out");
      return;
    }

    if (currentIndex < questions.length - 1) {
      setDirection(1);
      setCurrentIndex(currentIndex + 1);
    } else {
      submitForm();
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(currentIndex - 1);
    }
  };

  const submitForm = async () => {
    setIsSubmitting(true);
    await supabase.from('responses').insert({
      form_id: id,
      response: answers
    });
    setIsSubmitting(false);
    setIsFinished(true);
  };

  if (!form || questions.length === 0) return <div style={styles.center}>Loading...</div>;
  if (isFinished) return <div style={styles.center}><h1>Thank you!</h1><p>Your response has been recorded.</p></div>;

  const q = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div style={styles.container}>
      <div style={styles.progressBarBg}>
        <div style={{...styles.progressBarFill, width: `${progress}%`}}></div>
      </div>

      <div style={styles.card}>
        <h2 style={styles.questionText}>
          <span style={styles.number}>{currentIndex + 1} &rarr;</span> {q.question_text}
        </h2>
        {q.description && <p style={styles.description}>{q.description}</p>}
        
        <div style={styles.inputContainer}>
          {q.type === 'text' && (
            <input 
              style={styles.textInput} 
              type="text" 
              placeholder="Type your answer here..."
              value={answers[q.id] || ''}
              onChange={(e) => handleAnswer(e.target.value)}
              autoFocus
            />
          )}

          {q.type === 'single_choice' && (
            <div style={styles.choiceContainer}>
              {q.options.map((opt, i) => (
                <button 
                  key={i}
                  style={answers[q.id] === opt ? styles.choiceBtnSelected : styles.choiceBtn}
                  onClick={() => { handleAnswer(opt); setTimeout(goNext, 300); }}
                >
                  <span style={styles.keyHint}>{String.fromCharCode(65+i)}</span> {opt}
                </button>
              ))}
            </div>
          )}

          {q.type === 'rating' && (
            <div style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  style={answers[q.id] === num ? styles.ratingBtnSelected : styles.ratingBtn}
                  onClick={() => { handleAnswer(num); setTimeout(goNext, 300); }}
                >
                  {num}
                </button>
              ))}
            </div>
          )}

          {q.type === 'date' && (
            <input 
              type="date" 
              style={styles.textInput}
              value={answers[q.id] || ''}
              onChange={(e) => handleAnswer(e.target.value)}
              autoFocus
            />
          )}
        </div>

        <div style={styles.nav}>
          {currentIndex > 0 && (
            <button onClick={goBack} style={styles.navBtn}>Back</button>
          )}
          <button onClick={goNext} style={styles.primaryBtn}>
            {currentIndex === questions.length - 1 ? 'Submit' : (q.button_text || 'Next')}
          </button>
          <span style={styles.hint}>press <strong>Enter ↵</strong></span>
        </div>
      </div>
      
      <div style={styles.brand}>Powered by SlideForm</div>
    </div>
  );
}

const styles = {
  container: { fontFamily: '"Helvetica Neue", sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa', color: '#333' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' },
  progressBarBg: { position: 'fixed', top: 0, left: 0, right: 0, height: '4px', backgroundColor: '#eee' },
  progressBarFill: { height: '100%', backgroundColor: '#0445AF', transition: 'width 0.5s ease' },
  card: { width: '100%', maxWidth: '700px', padding: '20px', animation: 'fadeIn 0.5s' },
  questionText: { fontSize: '24px', fontWeight: '300', marginBottom: '10px' },
  description: { fontSize: '16px', color: '#666', marginBottom: '32px' },
  number: { color: '#0445AF', fontWeight: 'bold', marginRight: '8px' },
  inputContainer: { marginBottom: '40px' },
  textInput: { width: '100%', fontSize: '24px', border: 'none', borderBottom: '1px solid #ccc', padding: '10px 0', outline: 'none', background: 'transparent', transition: 'border-color 0.3s' },
  choiceContainer: { display: 'flex', flexDirection: 'column', gap: '10px' },
  choiceBtn: { textAlign: 'left', padding: '12px 20px', fontSize: '18px', border: '1px solid #0445AF', color: '#0445AF', background: 'white', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' },
  choiceBtnSelected: { textAlign: 'left', padding: '12px 20px', fontSize: '18px', border: '1px solid #0445AF', color: 'white', background: '#0445AF', borderRadius: '4px', cursor: 'pointer' },
  keyHint: { display: 'inline-block', width: '24px', height: '24px', border: '1px solid currentColor', borderRadius: '4px', textAlign: 'center', fontSize: '14px', marginRight: '10px', lineHeight: '22px', opacity: 0.6 },
  ratingContainer: { display: 'flex', gap: '10px' },
  ratingBtn: { width: '50px', height: '50px', fontSize: '20px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', borderRadius: '50%' },
  ratingBtnSelected: { width: '50px', height: '50px', fontSize: '20px', border: '1px solid #0445AF', background: '#0445AF', color: 'white', cursor: 'pointer', borderRadius: '50%' },
  nav: { display: 'flex', alignItems: 'center', gap: '15px' },
  primaryBtn: { padding: '10px 24px', fontSize: '20px', backgroundColor: '#0445AF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  navBtn: { padding: '10px 24px', fontSize: '20px', background: 'transparent', color: '#666', border: 'none', cursor: 'pointer' },
  hint: { fontSize: '12px', color: '#999', marginLeft: 'auto' },
  brand: { position: 'fixed', bottom: '20px', right: '20px', opacity: 0.3, fontSize: '12px' }
};