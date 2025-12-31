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
// THEME ENGINE (Strict Match to Python "Professional" Theme)
// ------------------------------------------------------------------
const THEME = {
  bg: "#F3F4F6",         // Slate 100 (Canvas Background)
  cardBg: "#FFFFFF",     // Pure White Card
  text: "#000000",       // Pure Black text (Sharp)
  subtext: "#555555",    // Dark Grey description
  accent: "#262627",     // PROFESSIONAL BLACK (Matches Python UI Buttons)
  highlight: "#0445AF",  // Blue ONLY for active inputs/selections
  border: "#E0E0E0",     // Light Grey border
  radius: "4px",         // Tighter radius (Less bubbly)
  shadow: "0 4px 12px rgba(0,0,0,0.08)", // Subtler shadow
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
}

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
  const inputRef = useRef(null)

  // ----------------------------------------------------------------
  // 1. DATA FETCHING & DECRYPTION
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

        const decrypted = qData.map(row => ({
          ...row,
          question_text: decryptAES(row.question_text, qKey),
          description: decryptAES(row.description, qKey),
          options: decryptAES(row.options, qKey) || []
        }))

        setQuestions(decrypted)
        setLoading(false)

      } catch (e) {
        setError("Failed to load secure survey.")
        setLoading(false)
      }
    }

    initializeForm()
  }, [id])

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
  }, [index])

  // ----------------------------------------------------------------
  // CRYPTO HELPERS
  // ----------------------------------------------------------------
  const decryptAES = (b64Cipher, key) => {
    if (!b64Cipher) return ""
    try {
      const raw = forge.util.decode64(b64Cipher)
      const iv = raw.substring(0, 12); const tag = raw.substring(12, 28); const ct = raw.substring(28)
      const decipher = forge.cipher.createDecipher('AES-GCM', key)
      decipher.start({ iv: iv, tag: tag })
      decipher.update(forge.util.createBuffer(ct))
      return decipher.finish() ? JSON.parse(decipher.output.toString()) : ""
    } catch { return "" }
  }

  const encryptResponse = (data) => {
    const sKey = forge.random.getBytesSync(32)
    const iv = forge.random.getBytesSync(12)
    const c = forge.cipher.createCipher('AES-GCM', sKey)
    c.start({ iv }); c.update(forge.util.createBuffer(JSON.stringify(data))); c.finish()
    
    const pub = forge.pki.publicKeyFromPem(keys.p)
    const encKey = pub.encrypt(sKey, 'RSA-OAEP', { md: forge.md.sha256.create() })

    return {
      key: forge.util.encode64(encKey),
      iv: forge.util.encode64(iv),
      tag: forge.util.encode64(c.mode.tag.getBytes()),
      data: forge.util.encode64(c.output.getBytes())
    }
  }

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
      alert('Upload Error')
      setLoading(false)
    }
  }

  const handleNext = () => {
    const q = questions[index]
    const val = answers[q.id]
    
    if (['title', 'info'].includes(q.question_type)) { goStep(1); return }
    if (q.question_type === 'consent' && !consentChecked) { alert("Please check the box to continue."); return }
    if (q.required) {
        if (!val || (typeof val === 'string' && !val.trim())) { alert("Required"); return }
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
  if (loading || !questions.length) return <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center', fontFamily:'sans-serif', color:'#555'}}>Loading...</div>
  
  const q = questions[index]
  const val = answers[q.id]
  const isCentered = ['title', 'info'].includes(q.question_type)
  const isTitle = q.question_type === 'title'

  return (
    <div className="container">
      <style jsx global>{`
        body { margin: 0; background-color: ${THEME.bg}; color: ${THEME.text}; font-family: ${THEME.font}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        
        .progress-bar { position: fixed; top: 0; left: 0; height: 4px; background: ${THEME.accent}; transition: width 0.3s; z-index: 99; }
        
        /* CARD: SHARPER, LESS BUBBLY, SCROLLABLE */
        .card {
          background: ${THEME.cardBg}; width: 100%; max-width: 900px; min-height: 550px;
          border-radius: ${THEME.radius}; box-shadow: ${THEME.shadow};
          border: 1px solid ${THEME.border};
          padding: 60px 80px; display: flex; flex-direction: column; position: relative;
          overflow-y: auto; max-height: 90vh; /* Handle very long content */
        }

        /* TYPOGRAPHY: PROFESSIONAL WEIGHTS */
        .question-title { 
          font-size: ${isTitle ? '40px' : (isCentered ? '32px' : '26px')}; 
          font-weight: ${isTitle ? '700' : (isCentered ? '600' : '500')};
          text-align: ${isCentered ? 'center' : 'left'};
          margin: 0 0 15px 0; color: #000; line-height: 1.25;
        }
        .description { 
          font-size: 18px; 
          font-weight: 300;
          text-align: ${isCentered ? 'center' : 'left'};
          color: ${THEME.subtext}; white-space: pre-wrap; margin-bottom: 40px;
        }

        /* CONSENT SPECIFIC SCROLL BOX - FIXED FORMATTING */
        .scroll-desc {
            max-height: 200px;
            overflow-y: auto;
            background: #FAFAFA;
            border: 1px solid #EEE;
            padding: 15px;
            font-size: 14px;
            margin-bottom: 20px;
            color: #444;
            border-radius: 4px;
            white-space: pre-wrap; /* This preserves newlines and spaces */
        }

        /* INPUTS - BLUE HIGHLIGHT ONLY ON FOCUS */
        .tf-input {
          width: 100%; font-size: 24px; color: #000; 
          border: none; border-bottom: 1px solid ${THEME.border}; background: transparent; 
          padding: 8px 0; outline: none; transition: border-color 0.2s;
        }
        .tf-input::placeholder { color: #BBB; opacity: 1; font-weight: 300; }
        .tf-input:focus { border-bottom: 2px solid ${THEME.highlight}; }

        /* BUTTONS - MONOCHROME PROFESSIONAL */
        .btn-action {
          background-color: ${THEME.accent}; color: white;
          font-size: 18px; font-weight: 600;
          padding: 12px 32px; border-radius: ${THEME.radius}; border: none; cursor: pointer;
          transition: all 0.2s;
        }
        .btn-action:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-action:active { transform: translateY(0); }
        .btn-action:disabled { background-color: #E0E0E0; color: #999; cursor: not-allowed; transform: none; }
        
        .btn-back { background: transparent; border: none; color: ${THEME.subtext}; font-weight: 500; font-size: 15px; cursor: pointer; }
        .btn-back:hover { color: #000; }

        /* CHOICE TILES */
        .choice-item {
          padding: 12px 18px; border: 1px solid ${THEME.border}; border-radius: ${THEME.radius};
          margin-bottom: 8px; cursor: pointer; display: flex; align-items: center;
          font-size: 16px; transition: all 0.15s; background: white; color: #000;
        }
        .choice-item:hover { border-color: ${THEME.highlight}; background-color: #F8FAFC; color: ${THEME.highlight}; }
        .choice-item.selected { background-color: #F0F9FF; border-color: ${THEME.highlight}; color: ${THEME.highlight}; font-weight: 600; }
        .key-badge { 
          width: 24px; height: 24px; border: 1px solid #DDD; color: #777; 
          border-radius: 50%; /* Rounded for radio look */
          display: flex; align-items: center; justify-content: center;
          margin-right: 15px; font-size: 11px; font-weight: 600;
        }
        .choice-item.selected .key-badge { border-color: ${THEME.highlight}; color: ${THEME.highlight}; background: white; border-width: 2px; }

        /* CONSENT CHECKBOX */
        .consent-label { display: flex; align-items: flex-start; cursor: pointer; padding: 10px 0; user-select: none; }
        .custom-check {
          width: 22px; height: 22px; border: 1px solid ${THEME.border}; border-radius: 3px;
          margin-right: 15px; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; background: white; transition: all 0.2s; color: white; font-size: 14px;
        }
        .consent-label:hover .custom-check { border-color: ${THEME.highlight}; }
        .consent-label.checked .custom-check { background: ${THEME.highlight}; border-color: ${THEME.highlight}; }

        /* FOOTER */
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
          
          {/* HEADER */}
          <div style={{width: '100%'}}>
            <h1 className="question-title">
              {q.question_text}{q.required && <span style={{color:'#DC2626', fontSize:'0.6em', marginLeft: 4, verticalAlign:'top'}}>*</span>}
            </h1>
            {/* If Consent, show scrollable description box instead of standard text */}
            {q.question_type === 'consent' ? (
                <div className="scroll-desc">{q.description}</div>
            ) : (
                q.description && <div className="description">{q.description}</div>
            )}
          </div>

          {/* INPUTS */}
          <div className="input-group">
            
            {/* TEXT FIELDS */}
            {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
              <div style={{width: '100%', display:'flex', alignItems:'center'}}>
                <input ref={inputRef}
                  className="tf-input"
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
              <textarea ref={inputRef}
                className="tf-input"
                placeholder="Type your answer here..."
                value={val || ''}
                onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                style={{minHeight: 120, resize:'none'}}
              />
            )}

            {/* CHOICES */}
            {['single_choice', 'yes_no'].includes(q.question_type) && (
              <div style={{width: '100%'}}>
                {(q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                  <div key={i} className={`choice-item ${val === opt ? 'selected' : ''}`} onClick={() => handleChoice(opt)}>
                    <div className="key-badge">{String.fromCharCode(65 + i)}</div>
                    {opt}
                  </div>
                ))}
              </div>
            )}

            {/* CONSENT (CHECKBOX) */}
            {q.question_type === 'consent' && (
              <div style={{width:'100%'}}>
                <label className={`consent-label ${consentChecked ? 'checked' : ''}`} onClick={() => {
                   const newState = !consentChecked
                   setConsentChecked(newState)
                   setAnswers({...answers, [q.id]: newState ? "Agreed" : ""})
                }}>
                  <div className="custom-check">{consentChecked && '✓'}</div>
                  <div>
                    {/* Updated to dynamically use survey text */}
                    <div style={{fontSize: 16, fontWeight: '600', marginBottom: 4, color: THEME.text}}>{q.checkbox_label || "I accept the terms"}</div>
                    <div style={{fontSize: 13, color: THEME.subtext}}>I have read and agree to the terms and conditions described above.</div>
                  </div>
                </label>
              </div>
            )}

            {/* SLIDERS */}
            {['rating', 'slider'].includes(q.question_type) && (
               <div style={{width:'100%', textAlign:'center'}}>
                 <input type="range" 
                   min={q.range_min || 1} max={q.range_max || 10} 
                   value={val || Math.ceil((q.range_max||10)/2)}
                   onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                   style={{width:'80%', accentColor: THEME.highlight, cursor:'pointer'}}
                 />
                 <div style={{fontSize: 40, fontWeight: 700, color: THEME.highlight, marginTop: 10}}>
                   {val || Math.ceil((q.range_max||10)/2)}
                 </div>
               </div>
            )}

             {/* CONTACT INFO */}
             {q.question_type === 'contact_info' && (
                <div style={{width: '100%'}}>
                  {['First Name', 'Last Name', 'Email', 'Phone'].map(f => (
                    <div key={f} style={{marginBottom: 20}}>
                      <label style={{fontSize: 13, fontWeight: 600, color: THEME.text, display:'block', marginBottom: 5}}>{f}</label>
                      <input 
                        className="tf-input"
                        style={{fontSize: 18}}
                        type={f === 'Email' ? 'email' : 'text'} 
                        placeholder="..." 
                        value={(val || {})[f] || ''} 
                        onChange={e => updateContact(f, e.target.value)} 
                      />
                    </div>
                  ))}
                </div>
              )}

          </div>
        </div>

        {/* FOOTER */}
        <div className="footer">
          <button className="btn-back" style={{opacity: index===0 ? 0 : 1}} onClick={() => goStep(-1)}>← Back</button>
          
          {/* Main Action Button (Start / Next / Submit) */}
          {/* NOTE: We hide this button for simple text inputs because they have an inline 'OK' button */}
          {(!['text', 'email', 'phone', 'number', 'single_choice', 'yes_no'].includes(q.question_type) || index === questions.length - 1) && (
            <div style={{display:'flex', alignItems:'center'}}>
              <button className="btn-action" onClick={handleNext} disabled={q.question_type === 'consent' && !consentChecked}>
                {index < questions.length - 1 ? (q.button_text || 'Continue') : 'Submit'}
              </button>
              {['long_text'].includes(q.question_type) && <div className="hint-text">press <strong>Enter ↵</strong></div>}
            </div>
          )}
        </div>

        {/* COUNTER */}
        <div className="counter">{index + 1} / {questions.length}</div>

      </div>
    </div>
  )
}
