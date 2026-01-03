import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import forge from 'node-forge'

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------
const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ------------------------------------------------------------------
// THEME ENGINE
// ------------------------------------------------------------------
const THEME = {
  bg: "#F3F4F6",          
  cardBg: "#FFFFFF",      
  text: "#000000",        
  subtext: "#555555",     
  accent: "#262627",      
  highlight: "#0445AF",   
  border: "#E0E0E0",      
  radius: "4px",          
  shadow: "0 4px 12px rgba(0,0,0,0.08)",
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
}

// ------------------------------------------------------------------
// ICONS
// ------------------------------------------------------------------
const StarIcon = ({ filled, onClick, onMouseEnter, onMouseLeave }) => (
  <svg 
    onClick={onClick} 
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    width="40" height="40" viewBox="0 0 24 24" 
    fill={filled ? THEME.highlight : "none"} 
    stroke={filled ? THEME.highlight : "#ccc"} 
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ cursor: 'pointer', transition: 'all 0.1s', marginRight: 8 }}
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
)

export default function FormPage() {
  const router = useRouter()
  const { id } = router.query
  
  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  const [questions, setQuestions] = useState([]) 
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [keys, setKeys] = useState({ q: null, p: null })
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)
  const [hoverRating, setHoverRating] = useState(0) // For star hover effect

  const inputRef = useRef(null)

  // ----------------------------------------------------------------
  // CRYPTO HELPERS
  // ----------------------------------------------------------------
  const decryptAES = (b64Cipher, key) => {
    if (!b64Cipher) return ""
    try {
      const raw = forge.util.decode64(b64Cipher)
      const iv = raw.substring(0, 12)
      const tag = raw.substring(12, 28)
      const ct = raw.substring(28)

      const decipher = forge.cipher.createDecipher('AES-GCM', key)
      decipher.start({ iv: iv, tag: forge.util.createBuffer(tag) })
      decipher.update(forge.util.createBuffer(ct))
      
      const pass = decipher.finish()
      if (!pass) return ""
      return JSON.parse(decipher.output.toString())
    } catch (e) { 
      console.error("Decryption Error:", e)
      return "" 
    }
  }

  const encryptResponse = (data) => {
    try {
        const sKey = forge.random.getBytesSync(32)
        const iv = forge.random.getBytesSync(12)
        const c = forge.cipher.createCipher('AES-GCM', sKey)
        c.start({ iv }); 
        c.update(forge.util.createBuffer(JSON.stringify(data))); 
        c.finish()
        
        const pub = forge.pki.publicKeyFromPem(keys.p)
        const encKey = pub.encrypt(sKey, 'RSA-OAEP', { md: forge.md.sha256.create() })

        return {
        key: forge.util.encode64(encKey),
        iv: forge.util.encode64(iv),
        tag: forge.util.encode64(c.mode.tag.getBytes()),
        data: forge.util.encode64(c.output.getBytes())
        }
    } catch (e) {
        throw e
    }
  }

  // ----------------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!id) return

    const initializeForm = async () => {
      try {
        const { data: keyData, error: keyError } = await supabase
          .from('survey_keys').select('*').eq('form_id', id).single()
        
        if (keyError || !keyData) throw new Error("Survey not found.")

        const qKey = forge.util.decode64(keyData.q_key)
        setKeys({ q: qKey, p: keyData.p_key })

        const { data: qData, error: qError } = await supabase
          .from('questions').select('*').eq('form_id', id).order('order')
        
        if (qError) throw qError
        
        const decrypted = qData.map((row, i) => {
          try {
              return {
                ...row,
                question_text: decryptAES(row.question_text, qKey),
                description: decryptAES(row.description, qKey),
                options: decryptAES(row.options, qKey) || [],
                included_fields: decryptAES(row.included_fields, qKey) || ["First Name", "Email"],
                checkbox_label: row.checkbox_label || "I accept the terms and conditions"
              }
          } catch (err) {
              return null
          }
        }).filter(q => q !== null)

        setQuestions(decrypted)
        setLoading(false)

      } catch (e) {
        setError(e.message || "Failed to load secure survey.")
        setLoading(false)
      }
    }

    initializeForm()
  }, [id])

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
    setHoverRating(0)
  }, [index])


  // ----------------------------------------------------------------
  // HANDLERS
  // ----------------------------------------------------------------
  const handleSubmit = async () => {
    try {
      setLoading(true)
      const encryptedPayload = encryptResponse(answers)
      const { error } = await supabase.from('responses').insert({ form_id: id, response: encryptedPayload })
      if (error) throw error
      alert('Response securely recorded.')
      window.location.reload()
    } catch (e) {
      alert('Upload Error: ' + e.message)
      setLoading(false)
    }
  }

  const handleNext = () => {
    const q = questions[index]
    const val = answers[q.id]
    
    if (['title', 'info'].includes(q.question_type)) { goStep(1); return }
    if (q.question_type === 'consent' && !consentChecked) { alert("Please check the box to continue."); return }
    if (q.required) {
      if (q.question_type === 'contact_info') {
         const fields = q.included_fields || []
         const current = val || {}
         for (let f of fields) {
            if (!current[f] || !current[f].trim()) { alert(`Please enter your ${f}`); return }
         }
      } else if (!val || (typeof val === 'string' && !val.trim())) { 
          alert("Required field"); return 
      }
    }
    goStep(1)
  }

  const goStep = (dir) => {
    if (index + dir < 0) return
    if (index + dir >= questions.length) { handleSubmit(); return }
    setIndex(index + dir)
    setConsentChecked(false)
  }

  const handleChoice = (opt) => {
    setAnswers({...answers, [questions[index].id]: opt})
    setTimeout(() => goStep(1), 150)
  }

  const updateContact = (field, val) => {
      const qId = questions[index].id
      const current = answers[qId] || {}
      setAnswers({ ...answers, [qId]: { ...current, [field]: val } })
  }

  // ----------------------------------------------------------------
  // RENDERER
  // ----------------------------------------------------------------
  if (loading) return <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center'}}>Loading...</div>
  if (error) return <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center', color:'red'}}>{error}</div>
  if (!questions.length) return <div>No questions found.</div>
  
  const q = questions[index]
  const val = answers[q.id]
  const isCentered = ['title', 'info'].includes(q.question_type)
  const isTitle = q.question_type === 'title'
  const hasInlineNext = ['text', 'email', 'phone', 'number', 'single_choice', 'yes_no'].includes(q.question_type)
  const isLastSlide = index === questions.length - 1

  return (
    <div className="container">
      <style jsx global>{`
        body { margin: 0; background-color: ${THEME.bg}; color: ${THEME.text}; font-family: ${THEME.font}; }
        .container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .progress-bar { position: fixed; top: 0; left: 0; height: 4px; background: ${THEME.accent}; transition: width 0.3s; z-index: 99; }
        .card {
          background: ${THEME.cardBg}; width: 100%; max-width: 900px; min-height: 550px;
          border-radius: ${THEME.radius}; box-shadow: ${THEME.shadow}; border: 1px solid ${THEME.border};
          padding: 60px 80px; display: flex; flex-direction: column; position: relative;
          overflow-y: auto; max-height: 90vh;
        }
        .question-title { 
          font-size: ${isTitle ? '40px' : (isCentered ? '32px' : '26px')}; 
          font-weight: ${isTitle ? '700' : (isCentered ? '600' : '500')};
          text-align: ${isCentered ? 'center' : 'left'}; margin: 0 0 15px 0; color: #000; line-height: 1.25;
        }
        .description { 
          font-size: 18px; font-weight: 300; text-align: ${isCentered ? 'center' : 'left'};
          color: ${THEME.subtext}; white-space: pre-wrap; margin-bottom: 40px;
        }
        .scroll-desc {
            max-height: 200px; overflow-y: auto; background: #FAFAFA; border: 1px solid #EEE;
            padding: 15px; font-size: 14px; margin-bottom: 20px; color: #444; border-radius: 4px; white-space: pre-wrap;
        }
        
        /* INPUTS */
        .tf-input {
          width: 100%; font-size: 24px; color: #000; border: none; border-bottom: 1px solid ${THEME.border}; 
          background: transparent; padding: 8px 0; outline: none; transition: border-color 0.2s;
        }
        .tf-input:focus { border-bottom: 2px solid ${THEME.highlight}; }
        
        /* BUTTONS */
        .btn-action {
          background-color: ${THEME.accent}; color: white; font-size: 18px; font-weight: 600;
          padding: 12px 32px; border-radius: ${THEME.radius}; border: none; cursor: pointer; transition: all 0.2s;
        }
        .btn-action:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-action:disabled { background-color: #E0E0E0; color: #999; cursor: not-allowed; transform: none; }
        .btn-back { background: transparent; border: none; color: ${THEME.subtext}; font-weight: 500; font-size: 15px; cursor: pointer; }
        .btn-back:hover { color: #000; }
        
        /* CHOICES */
        .choice-item {
          padding: 12px 18px; border: 1px solid ${THEME.border}; border-radius: ${THEME.radius};
          margin-bottom: 8px; cursor: pointer; display: flex; align-items: center; font-size: 16px; transition: all 0.15s; background: white; color: #000;
        }
        .choice-item:hover { border-color: ${THEME.highlight}; background-color: #F8FAFC; color: ${THEME.highlight}; }
        .choice-item.selected { background-color: #F0F9FF; border-color: ${THEME.highlight}; color: ${THEME.highlight}; font-weight: 600; }
        .key-badge { 
          width: 24px; height: 24px; border: 1px solid #DDD; color: #777; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; margin-right: 15px; font-size: 11px; font-weight: 600;
        }
        .choice-item.selected .key-badge { border-color: ${THEME.highlight}; color: ${THEME.highlight}; background: white; border-width: 2px; }
        
        /* CONSENT */
        .consent-label { display: flex; align-items: flex-start; cursor: pointer; padding: 10px 0; user-select: none; }
        .custom-check {
          width: 22px; height: 22px; border: 1px solid ${THEME.border}; border-radius: 3px;
          margin-right: 15px; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; background: white; transition: all 0.2s; color: white; font-size: 14px;
        }
        .consent-label.checked .custom-check { background: ${THEME.highlight}; border-color: ${THEME.highlight}; }
        
        /* SLIDER CUSTOMIZATION */
        .slider-container { width: 100%; position: relative; padding: 20px 0; }
        .custom-range {
            -webkit-appearance: none; width: 100%; height: 6px; background: #E5E7EB; border-radius: 3px; outline: none;
        }
        .custom-range::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; 
            background: ${THEME.highlight}; cursor: pointer; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            transition: transform 0.1s;
        }
        .custom-range::-webkit-slider-thumb:hover { transform: scale(1.1); }
        .range-labels { display: flex; justify-content: space-between; margin-top: 15px; font-size: 14px; color: ${THEME.subtext}; font-weight: 600; }
        .range-val-bubble {
            position: absolute; top: -15px; left: 50%; transform: translateX(-50%); 
            background: ${THEME.highlight}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 14px; font-weight: bold;
        }

        /* CONTACT GRID */
        .contact-grid {
            display: grid; grid-template-columns: 1fr 1fr; gap: 30px; width: 100%; margin-top: 10px;
        }
        .contact-field { display: flex; flex-direction: column; }
        .contact-field.full { grid-column: span 2; }
        .contact-label { font-size: 13px; font-weight: 700; color: ${THEME.highlight}; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }

        .footer { margin-top: auto; padding-top: 40px; display: flex; justify-content: space-between; align-items: center; width: 100%; border-top: 1px solid #FAFAFA; }
        .hint-text { font-size: 12px; color: ${THEME.subtext}; margin-left: 12px; font-weight: 400; }
        .counter { position: absolute; bottom: 30px; right: 40px; font-size: 13px; font-weight: 600; color: #CCC; }
        .content-area { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; }
        .input-group { width: 100%; display: flex; flex-direction: column; gap: 20px; align-items: ${isCentered ? 'center' : 'flex-start'}; }
      `}</style>

      <div className="progress-bar" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />

      <div className="card">
        
        {/* CONTENT AREA */}
        <div className="content-area">
          <div style={{width: '100%'}}>
            <h1 className="question-title">
              {q.question_text}{q.required && <span style={{color:'#DC2626', fontSize:'0.6em', marginLeft: 4, verticalAlign:'top'}}>*</span>}
            </h1>
            {q.question_type === 'consent' ? (
                <div className="scroll-desc">{q.description}</div>
            ) : (
                q.description && <div className="description">{q.description}</div>
            )}
          </div>

          <div className="input-group">
            {/* TEXT FIELDS */}
            {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
              <div style={{width: '100%', display:'flex', alignItems:'center'}}>
                <input ref={inputRef} className="tf-input"
                  type={q.question_type === 'number' ? 'number' : 'text'}
                  placeholder="Type your answer here..."
                  value={val || ''}
                  onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                  onKeyDown={e => e.key === 'Enter' && handleNext()}
                />
                <button className="btn-action" style={{marginLeft: 20, padding: '10px 24px', fontSize: 16}} onClick={handleNext}>OK ✓</button>
              </div>
            )}

            {/* LONG TEXT */}
            {q.question_type === 'long_text' && (
              <textarea ref={inputRef} className="tf-input" placeholder="Type..." value={val || ''}
                onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                style={{minHeight: 120, resize:'none'}}
              />
            )}

            {/* CHOICES */}
            {['single_choice', 'yes_no'].includes(q.question_type) && (
              <div style={{width: '100%'}}>
                {(q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                  <div key={i} className={`choice-item ${val === opt ? 'selected' : ''}`} onClick={() => handleChoice(opt)}>
                    <div className="key-badge">{String.fromCharCode(65 + i)}</div> {opt}
                  </div>
                ))}
              </div>
            )}

            {/* CONSENT */}
            {q.question_type === 'consent' && (
              <div style={{width:'100%'}}>
                <label className={`consent-label ${consentChecked ? 'checked' : ''}`} onClick={() => {
                   const newState = !consentChecked; setConsentChecked(newState);
                   setAnswers({...answers, [q.id]: newState ? "Agreed" : ""})
                }}>
                  <div className="custom-check">{consentChecked && '✓'}</div>
                  <div>
                    <div style={{fontSize: 16, fontWeight: '600', marginBottom: 4, color: THEME.text}}>{q.checkbox_label}</div>
                    <div style={{fontSize: 13, color: THEME.subtext}}>I have read and agree to the terms above.</div>
                  </div>
                </label>
              </div>
            )}

            {/* RATING (STARS) - FIXED */}
            {q.question_type === 'rating' && (
               <div style={{width:'100%', display:'flex', alignItems:'center', marginTop: 10}}>
                 {[...Array(q.range_max || 5)].map((_, i) => {
                    const idx = i + 1;
                    return (
                        <StarIcon 
                            key={i} 
                            filled={idx <= (hoverRating || val || 0)}
                            onClick={() => {
                                setAnswers({...answers, [q.id]: idx})
                                setTimeout(() => goStep(1), 300) // Auto-advance with delay
                            }}
                            onMouseEnter={() => setHoverRating(idx)}
                            onMouseLeave={() => setHoverRating(0)}
                        />
                    )
                 })}
               </div>
            )}

            {/* SLIDER - PROFESSIONAL */}
            {q.question_type === 'slider' && (
              <div className="slider-container">
                <div className="range-val-bubble">{val || Math.ceil((q.range_max||10)/2)}</div>
                <input type="range" className="custom-range"
                  min={q.range_min || 0} max={q.range_max || 10} 
                  value={val || Math.ceil((q.range_max||10)/2)}
                  onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                />
                <div className="range-labels">
                    <span>{q.range_min || 0}</span>
                    <span>{q.range_max || 10}</span>
                </div>
              </div>
            )}

             {/* CONTACT INFO - REDESIGNED */}
             {q.question_type === 'contact_info' && (
                <div className="contact-grid">
                  {(q.included_fields || ["First Name", "Email"]).map(f => {
                    // Check if it's a name field to put it in a half-column, otherwise full width
                    const isName = f.toLowerCase().includes('name')
                    return (
                        <div key={f} className={`contact-field ${isName ? '' : 'full'}`}>
                            <label className="contact-label">{f}</label>
                            <input 
                                className="tf-input" 
                                style={{fontSize: 20}} 
                                type={f.includes('Email') ? 'email' : 'text'} 
                                placeholder="..." 
                                value={(val || {})[f] || ''} 
                                onChange={e => updateContact(f, e.target.value)} 
                            />
                        </div>
                    )
                  })}
                </div>
             )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="footer">
          <button className="btn-back" style={{opacity: index===0 ? 0 : 1}} onClick={() => goStep(-1)}>← Back</button>
          
          {/* Main Action Button Logic */}
          {(!hasInlineNext || isLastSlide || q.question_type === 'rating') && (
            <div style={{display:'flex', alignItems:'center'}}>
              <button className="btn-action" onClick={handleNext} disabled={q.question_type === 'consent' && !consentChecked}>
                {isLastSlide ? 'Submit' : (q.button_text || 'Continue')}
              </button>
              {['long_text'].includes(q.question_type) && <div className="hint-text">press <strong>Enter ↵</strong></div>}
            </div>
          )}
        </div>

        <div className="counter">{index + 1} / {questions.length}</div>
      </div>
    </div>
  )
}
