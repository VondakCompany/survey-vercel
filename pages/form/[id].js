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
// THEME ENGINE (Matches Python Professional Theme)
// ------------------------------------------------------------------
const THEME = {
  bg: "#F3F4F6",         // Slate 100 Background
  cardBg: "#FFFFFF",     // Pure White Card
  text: "#111827",       // Near Black
  subtext: "#6B7280",    // Grey description
  accent: "#0445AF",     // Typeform Blue
  border: "#E5E7EB",
  radius: "8px",
  shadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
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
        // Fetch Keys
        const { data: keyData, error: keyError } = await supabase
          .from('survey_keys').select('*').eq('form_id', id).single()
        if (keyError || !keyData) throw new Error("Survey not found or unpublished.")

        // Decode Keys
        const qKey = forge.util.decode64(keyData.q_key)
        setKeys({ q: qKey, p: keyData.p_key })

        // Fetch Content
        const { data: qData, error: qError } = await supabase
          .from('questions').select('*').eq('form_id', id).order('order')
        if (qError) throw qError

        // Decrypt Content
        const decrypted = qData.map(row => ({
          ...row,
          question_text: decryptAES(row.question_text, qKey),
          description: decryptAES(row.description, qKey),
          options: decryptAES(row.options, qKey) || []
        }))

        setQuestions(decrypted)
        setLoading(false)

      } catch (e) {
        setError(e.message || "Failed to load secure survey.")
        setLoading(false)
      }
    }

    initializeForm()
  }, [id])

  // Focus input on slide change
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
    
    // Asymmetric Encrypt the Session Key
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
      alert('Upload Error: ' + e.message)
      setLoading(false)
    }
  }

  const handleNext = () => {
    const q = questions[index]
    const val = answers[q.id]
    
    // Validation
    if (['title', 'info'].includes(q.question_type)) {
       goStep(1); return
    }
    if (q.question_type === 'consent' && !consentChecked) {
      alert("Please check the box to continue."); return
    }
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
    setTimeout(() => goStep(1), 250) // Slight delay for visual feedback
  }

  // ----------------------------------------------------------------
  // RENDERER
  // ----------------------------------------------------------------
  if (loading || !questions.length) return <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center', fontFamily:'sans-serif', color:'#666'}}>Loading...</div>
  
  const q = questions[index]
  const val = answers[q.id]
  const isCentered = ['title', 'info'].includes(q.question_type)
  const isTitle = q.question_type === 'title'

  return (
    <div className="container">
      {/* CSS STYLING MATCHING PYTHON EXACTLY */}
      <style jsx global>{`
        body { margin: 0; background-color: ${THEME.bg}; color: ${THEME.text}; font-family: ${THEME.font}; }
        .container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        
        .progress-bar { position: fixed; top: 0; left: 0; height: 4px; background: ${THEME.accent}; transition: width 0.3s; z-index: 99; }
        
        /* CARD */
        .card {
          background: ${THEME.cardBg}; width: 100%; max-width: 900px; min-height: 600px;
          border-radius: ${THEME.radius}; box-shadow: ${THEME.shadow};
          padding: 60px 80px; display: flex; flex-direction: column; position: relative;
        }

        /* TYPOGRAPHY - EXACT MATCH */
        .question-title { 
          font-size: ${isTitle ? '40px' : (isCentered ? '34px' : '28px')}; 
          font-weight: ${isTitle ? '800' : (isCentered ? '700' : '400')}; 
          text-align: ${isCentered ? 'center' : 'left'};
          margin: 0 0 15px 0; color: #000; line-height: 1.3;
        }
        .description { 
          font-size: ${isCentered ? '20px' : '18px'}; 
          font-weight: ${isCentered ? '400' : '300'};
          text-align: ${isCentered ? 'center' : 'left'};
          color: ${THEME.subtext}; white-space: pre-wrap; margin-bottom: 40px;
        }

        /* INPUTS - BLUE UNDERLINE */
        .tf-input {
          width: 100%; font-size: 26px; color: ${THEME.accent}; 
          border: none; border-bottom: 2px solid #E5E7EB; background: transparent; 
          padding: 10px 0; outline: none; transition: border-color 0.3s;
        }
        .tf-input::placeholder { color: #D1D5DB; opacity: 1; }
        .tf-input:focus { border-bottom-color: ${THEME.accent}; }

        /* BUTTONS */
        .btn-action {
          background-color: ${THEME.accent}; color: white;
          font-size: 20px; font-weight: 700;
          padding: 12px 36px; border-radius: 4px; border: none; cursor: pointer;
          transition: transform 0.1s, opacity 0.2s;
        }
        .btn-action:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-action:active { transform: translateY(1px); }
        .btn-action:disabled { background-color: #E5E5E5; color: #A3A3A3; cursor: not-allowed; transform: none; }
        
        .btn-back { background: transparent; border: none; color: ${THEME.subtext}; font-weight: 600; font-size: 16px; cursor: pointer; }
        .btn-back:hover { color: #000; }

        /* CHOICES */
        .choice-item {
          padding: 14px 20px; border: 1px solid ${THEME.border}; border-radius: 4px;
          margin-bottom: 10px; cursor: pointer; display: flex; align-items: center;
          font-size: 18px; transition: all 0.2s; background: white;
        }
        .choice-item:hover { border-color: ${THEME.accent}; background-color: #FAFAFA; }
        .choice-item.selected { background-color: #F0F9FF; border-color: ${THEME.accent}; color: ${THEME.accent}; font-weight: 600; }
        .key-badge { 
          width: 28px; height: 28px; border: 1px solid #DDD; color: #999; 
          border-radius: 4px; display: flex; align-items: center; justify-content: center;
          margin-right: 15px; font-size: 12px; font-weight: bold;
        }
        .choice-item.selected .key-badge { border-color: ${THEME.accent}; color: ${THEME.accent}; background: white; }

        /* CONSENT CHECKBOX */
        .consent-label { display: flex; align-items: flex-start; cursor: pointer; padding: 20px 0; }
        .custom-check {
          width: 24px; height: 24px; border: 2px solid ${THEME.border}; border-radius: 4px;
          margin-right: 15px; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; background: white; transition: all 0.2s;
        }
        .consent-label.checked .custom-check { background: ${THEME.accent}; border-color: ${THEME.accent}; color: white; }

        /* FOOTER */
        .footer { margin-top: auto; padding-top: 40px; display: flex; justify-content: space-between; align-items: center; }
        .hint-text { font-size: 13px; color: ${THEME.subtext}; margin-left: 10px; }
        .counter { position: absolute; bottom: 30px; right: 40px; font-size: 14px; font-weight: 700; color: #9CA3AF; }
        
        .content-area { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; }
        .input-group { width: 100%; display: flex; flex-direction: column; gap: 20px; align-items: ${isCentered ? 'center' : 'flex-start'}; }
      `}</style>

      <div className="progress-bar" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />

      <div className="card">
        
        {/* CONTENT AREA */}
        <div className="content-area">
          
          {/* HEADER */}
          <div>
            <h1 className="question-title">
              {q.question_text}{q.required && <span style={{color:'#DC2626', fontSize:'0.6em', marginLeft: 4, verticalAlign:'top'}}>*</span>}
            </h1>
            {q.description && <div className="description">{q.description}</div>}
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
                <button className="btn-action" style={{marginLeft: 20, padding: '8px 20px', fontSize: 16}} onClick={handleNext}>OK ✓</button>
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
                    <div style={{fontSize: 18, fontWeight: '700', marginBottom: 4}}>I accept the terms</div>
                    <div style={{fontSize: 14, color: THEME.subtext}}>I have read and agree to the terms and conditions above.</div>
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
                   style={{width:'80%', accentColor: THEME.accent, cursor:'pointer'}}
                 />
                 <div style={{fontSize: 40, fontWeight: 800, color: THEME.accent, marginTop: 10}}>
                   {val || Math.ceil((q.range_max||10)/2)}
                 </div>
               </div>
            )}

          </div>
        </div>

        {/* FOOTER */}
        <div className="footer">
          <button className="btn-back" style={{opacity: index===0 ? 0 : 1}} onClick={() => goStep(-1)}>← Back</button>
          
          {/* Main Action Button (Start / Next / Submit) */}
          {(['title', 'info', 'consent'].includes(q.question_type) || index === questions.length - 1) && (
            <button className="btn-action" onClick={handleNext} disabled={q.question_type === 'consent' && !consentChecked}>
              {index < questions.length - 1 ? (q.button_text || 'Continue') : 'Submit'}
            </button>
          )}
          
          {/* Hint Text for Text Inputs */}
          {['text','email','number','long_text'].includes(q.question_type) && (
            <div className="hint-text">press <strong>Enter ↵</strong></div>
          )}
        </div>

        {/* COUNTER */}
        <div className="counter">{index + 1} / {questions.length}</div>

      </div>
    </div>
  )
}
