import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';

// HARDCODED CONFIG
const SUPABASE_URL = "https://xrgrlfpjeovjeshebxya.supabase.co";
const SUPABASE_KEY = "sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS"; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function FormRunner() {
  const router = useRouter();
  const { id } = router.query;

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const loadData = async () => {
      const { data: qData, error } = await supabase
        .from('questions')
        .select('*')
        .eq('form_id', id)
        .order('order', { ascending: true });

      if (error) console.error("Error loading questions:", error);

      const parsed = (qData || []).map(q => ({
        ...q,
        type: q.question_type,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
      }));

      setQuestions(parsed);
      setLoading(false);
    };
    loadData();
  }, [id]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Allow Shift+Enter for long text
        if (questions[currentIndex]?.type !== 'long_text') {
           e.preventDefault();
           goNext();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentIndex, questions, answers]);

  const handleAnswer = (val) => {
    const qId = questions[currentIndex].id;
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const goNext = () => {
    const q = questions[currentIndex];
    
    // VALIDATION
    if (q.required) {
        const val = answers[q.id];
        if (val === undefined || val === null || val === "" || (typeof val === 'string' && val.trim() === "")) {
            alert("Please fill out this field.");
            return;
        }
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      submitForm();
    }
  };

  const goBack = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  const submitForm = async () => {
    try {
      const { error } = await supabase.from('responses').insert({
        form_id: id,
        response: answers
      });
      if (error) throw error;
      setIsFinished(true);
    } catch (err) {
      alert("Submission failed: " + err.message);
    }
  };

  if (loading) return <div style={styles.center}>Loading form...</div>;
  if (isFinished) return <div style={styles.center}><h1>All done!</h1><p>Thanks for your time.</p></div>;
  if (questions.length === 0) return <div style={styles.center}>No questions found.</div>;

  const q = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div style={styles.container}>
      <div style={styles.progressContainer}>
        <div style={{...styles.progressFill, width: `${progress}%`}}></div>
      </div>

      <div style={styles.stage}>
        <div style={styles.content}>
          <h1 style={styles.questionText}>
            <span style={styles.number}>{currentIndex + 1} &rarr;</span>
            {q.question_text || "..."}
          </h1>
          {q.required && <span style={styles.reqMark}>* Required</span>}
          
          {q.description && <h3 style={styles.desc}>{q.description}</h3>}

          <div style={styles.inputArea}>
            
            {/* TEXT / EMAIL / PHONE */}
            {['text', 'email', 'phone'].includes(q.type) && (
              <input 
                type={q.type === 'email' ? 'email' : 'text'}
                style={styles.textInput}
                placeholder={q.type === 'email' ? "name@example.com" : "Type your answer..."}
                value={answers[q.id] || ''}
                onChange={e => handleAnswer(e.target.value)}
                autoFocus
              />
            )}

            {/* LONG TEXT */}
            {q.type === 'long_text' && (
              <textarea 
                style={styles.textArea}
                placeholder="Type your answer here..."
                value={answers[q.id] || ''}
                onChange={e => handleAnswer(e.target.value)}
                autoFocus
              />
            )}

            {/* SINGLE CHOICE */}
            {q.type === 'single_choice' && (
              <div style={styles.choiceGrid}>
                {q.options?.map((opt, i) => (
                  <button 
                    key={i}
                    style={answers[q.id] === opt ? styles.choiceBtnActive : styles.choiceBtn}
                    onClick={() => { handleAnswer(opt); setTimeout(goNext, 250); }}
                  >
                    <span style={styles.key}>{String.fromCharCode(65+i)}</span>
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* YES / NO */}
            {q.type === 'yes_no' && (
              <div style={styles.ratingRow}>
                 {['Yes', 'No'].map(opt => (
                    <button
                        key={opt}
                        style={answers[q.id] === opt ? styles.choiceBtnActive : styles.choiceBtn}
                        onClick={() => { handleAnswer(opt); setTimeout(goNext, 250); }}
                    >
                        {opt}
                    </button>
                 ))}
              </div>
            )}

            {/* RATING 1-5 */}
            {q.type === 'rating' && (
              <div style={styles.ratingRow}>
                {[1,2,3,4,5].map(num => (
                  <button
                    key={num}
                    style={answers[q.id] === num ? styles.ratingBtnActive : styles.ratingBtn}
                    onClick={() => { handleAnswer(num); setTimeout(goNext, 250); }}
                  >
                    {num}
                  </button>
                ))}
              </div>
            )}
            
            {/* NPS 0-10 */}
            {q.type === 'nps' && (
              <div style={styles.npsRow}>
                {[0,1,2,3,4,5,6,7,8,9,10].map(num => (
                  <button
                    key={num}
                    style={answers[q.id] === num ? styles.npsBtnActive : styles.npsBtn}
                    onClick={() => { handleAnswer(num); setTimeout(goNext, 250); }}
                  >
                    {num}
                  </button>
                ))}
              </div>
            )}

            {/* DATE */}
            {q.type === 'date' && (
               <input 
                type="date" 
                style={styles.textInput}
                value={answers[q.id] || ''}
                onChange={e => handleAnswer(e.target.value)}
                autoFocus
              />
            )}
          </div>

          <div style={styles.navBar}>
            {currentIndex > 0 && (
              <button onClick={goBack} style={styles.backBtn}>Back</button>
            )}
            <button onClick={goNext} style={styles.nextBtn}>
              {currentIndex === questions.length - 1 ? 'Submit' : (q.button_text || 'OK')} 
            </button>
          </div>
        </div>
      </div>
      
      <div style={styles.branding}>Powered by SlideForm</div>
    </div>
  );
}

const styles = {
  container: { 
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', 
    minHeight: '100vh', 
    backgroundColor: '#fafafa', 
    color: '#262627',
    display: 'flex',
    flexDirection: 'column'
  },
  center: { 
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: '1.2rem', color: '#666' 
  },
  progressContainer: { 
    position: 'fixed', top: 0, left: 0, right: 0, height: '6px', backgroundColor: '#E5E5E5', zIndex: 9999 
  },
  progressFill: { 
    height: '100%', backgroundColor: '#0445AF', transition: 'width 0.4s ease' 
  },
  stage: { 
    flex: 1, 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: '40px',
    width: '100%'
  },
  content: { 
    width: '100%', 
    maxWidth: '720px', 
  },
  questionText: { 
    fontSize: '28px', 
    fontWeight: '300', 
    marginBottom: '8px',
    lineHeight: '1.3'
  },
  reqMark: { color: 'red', fontSize: '12px', display: 'block', marginBottom: '16px' },
  number: { 
    color: '#0445AF', fontWeight: '600', marginRight: '12px', fontSize: '24px'
  },
  desc: {
    fontSize: '18px',
    color: 'rgba(38, 38, 39, 0.7)',
    fontWeight: 'normal',
    marginBottom: '32px',
    marginTop: '0px'
  },
  inputArea: { marginBottom: '40px' },
  textInput: { 
    width: '100%', 
    fontSize: '28px', 
    border: 'none', 
    borderBottom: '2px solid rgba(4, 69, 175, 0.3)', 
    padding: '10px 0', 
    background: 'transparent', 
    outline: 'none',
    color: '#0445AF'
  },
  textArea: { 
    width: '100%', 
    fontSize: '22px', 
    border: '2px solid rgba(4, 69, 175, 0.3)', 
    padding: '12px', 
    background: 'transparent', 
    outline: 'none',
    color: '#0445AF',
    minHeight: '120px',
    borderRadius: '4px'
  },
  choiceGrid: { 
    display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '100%' 
  },
  choiceBtn: { 
    textAlign: 'left', padding: '12px 16px', fontSize: '18px', 
    border: '1px solid rgba(4, 69, 175, 0.3)', 
    backgroundColor: 'rgba(255,255,255,0.8)', 
    color: '#0445AF', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s ease',
    display: 'flex', alignItems: 'center', minWidth: '120px'
  },
  choiceBtnActive: { 
    textAlign: 'left', padding: '12px 16px', fontSize: '18px', 
    border: '1px solid #0445AF', backgroundColor: '#0445AF', 
    color: 'white', borderRadius: '4px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', minWidth: '120px'
  },
  key: { 
    border: '1px solid currentColor', borderRadius: '3px', width: '24px', height: '24px', 
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', marginRight: '15px', opacity: 0.7 
  },
  ratingRow: { display: 'flex', gap: '10px' },
  ratingBtn: { 
    width: '50px', height: '50px', fontSize: '20px', 
    border: '1px solid #ccc', backgroundColor: 'white', cursor: 'pointer', borderRadius: '4px' 
  },
  ratingBtnActive: { 
    width: '50px', height: '50px', fontSize: '20px', 
    border: '1px solid #0445AF', backgroundColor: '#0445AF', color: 'white', cursor: 'pointer', borderRadius: '4px' 
  },
  npsRow: { display: 'flex', gap: '5px', flexWrap: 'wrap' },
  npsBtn: { 
    width: '40px', height: '40px', fontSize: '14px', 
    border: '1px solid #ccc', backgroundColor: 'white', cursor: 'pointer', borderRadius: '4px' 
  },
  npsBtnActive: { 
    width: '40px', height: '40px', fontSize: '14px', 
    border: '1px solid #0445AF', backgroundColor: '#0445AF', color: 'white', cursor: 'pointer', borderRadius: '4px' 
  },
  navBar: { display: 'flex', gap: '20px', marginTop: '40px' },
  nextBtn: { 
    padding: '10px 28px', fontSize: '18px', fontWeight: 'bold', 
    backgroundColor: '#0445AF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' 
  },
  backBtn: { 
    padding: '10px 20px', fontSize: '16px', 
    backgroundColor: 'transparent', color: '#666', border: 'none', cursor: 'pointer' 
  },
  branding: { 
    position: 'fixed', bottom: '20px', right: '20px', 
    padding: '8px 12px', background: 'white', borderRadius: '8px', 
    fontSize: '12px', color: '#666', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' 
  }
};