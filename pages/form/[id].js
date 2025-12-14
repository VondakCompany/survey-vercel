import { useState, useEffect } from 'react'
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
// These definitions match the Python backend exactly.
// ------------------------------------------------------------------
const THEMES = {
  pro: {
    name: "Professional",
    bg: "#FFFFFF",
    cardBg: "#FFFFFF",
    text: "#1A1A1A",
    accent: "#0445AF", // Deep Blue
    border: "#A3D5FF", // Light Blue Underline
    radius: "0px",
    btnText: "#FFFFFF",
    shadow: "none",
    inputStyle: "underline",
    align: "left",
    numberStyle: "arrow",
    font: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  },
  pop: {
    name: "Pop",
    bg: "#F8FAFC",
    cardBg: "#FFFFFF",
    text: "#1E293B",
    accent: "#2563EB", // Bright Blue
    border: "#E2E8F0",
    radius: "16px",
    btnText: "#FFFFFF",
    shadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15)",
    inputStyle: "box",
    align: "center",
    numberStyle: "none",
    font: "'Inter', sans-serif"
  }
}

export default function FormPage() {
  const router = useRouter()
  const { id } = router.query
  
  // ----------------------------------------------------------------
  // STATE MANAGEMENT
  // ----------------------------------------------------------------
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [keys, setKeys] = useState({ q: null, p: null })
  const [theme, setTheme] = useState(THEMES.pro) // Default to Pro
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)

  // ----------------------------------------------------------------
  // 1. INITIALIZATION & DECRYPTION
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!id) return

    const initializeForm = async () => {
      try {
        // A. Parse Secure Keys from URL Hash
        // URLSearchParams handles the % decoding automatically
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const qKeyB64 = hashParams.get('q')
        const pKeyPem = hashParams.get('p')

        if (!qKeyB64 || !pKeyPem) {
          throw new Error('MISSING KEYS: This is a secure E2EE form. Please use the full link provided by the builder.')
        }

        // B. Decode AES Key
        const qKey = forge.util.decode64(qKeyB64)
        setKeys({ q: qKey, p: pKeyPem })

        // C. Fetch Form Metadata (Theme)
        const { data: formData, error: formError } = await supabase
          .from('forms')
          .select('theme')
          .eq('id', id)
          .single()
        
        if (formError) throw formError
        
        // Apply Theme
        if (formData && formData.theme && THEMES[formData.theme]) {
          setTheme(THEMES[formData.theme])
        }

        // D. Fetch Questions
        const { data: questionData, error: questionError } = await supabase
          .from('questions')
          .select('*')
          .eq('form_id', id)
          .order('order')

        if (questionError) throw questionError

        // E. Decrypt Question Content
        const decryptedQuestions = questionData.map(row => {
          return {
            ...row,
            question_text: decryptAES(row.question_text, qKey),
            description: decryptAES(row.description, qKey),
            options: decryptAES(row.options, qKey) || []
          }
        })

        setQuestions(decryptedQuestions)
        setLoading(false)

      } catch (e) {
        console.error("Initialization Error:", e)
        setError(e.message || "Failed to load secure survey.")
        setLoading(false)
      }
    }

    initializeForm()
  }, [id])

  // ----------------------------------------------------------------
  // CRYPTO HELPERS
  // ----------------------------------------------------------------
  const decryptAES = (b64Cipher, key) => {
    if (!b64Cipher) return ""
    try {
      const raw = forge.util.decode64(b64Cipher)
      // Extract IV (12 bytes), Tag (16 bytes), Ciphertext (Rest)
      const iv = raw.substring(0, 12)
      const tag = raw.substring(12, 28)
      const ciphertext = raw.substring(28)

      const decipher = forge.cipher.createDecipher('AES-GCM', key)
      decipher.start({ iv: iv, tag: tag })
      decipher.update(forge.util.createBuffer(ciphertext))
      
      if (decipher.finish()) {
        return JSON.parse(decipher.output.toString())
      }
      return "[Decryption Failed]"
    } catch (e) { 
      return "" 
    }
  }

  // ----------------------------------------------------------------
  // 2. SUBMISSION HANDLER
  // ----------------------------------------------------------------
  const handleSubmit = async () => {
    try {
      setLoading(true)
      
      // A. Serialize Answers
      const payload = JSON.stringify(answers)
      
      // B. Generate Ephemeral Session Key
      const sessionKey = forge.random.getBytesSync(32)
      const iv = forge.random.getBytesSync(12)

      // C. Encrypt Data with Session Key (AES-GCM)
      const cipher = forge.cipher.createCipher('AES-GCM', sessionKey)
      cipher.start({ iv: iv })
      cipher.update(forge.util.createBuffer(payload))
      cipher.finish()
      
      const encryptedData = cipher.output.getBytes()
      const tag = cipher.mode.tag.getBytes()

      // D. Encrypt Session Key with Public Key (RSA-OAEP)
      const publicKey = forge.pki.publicKeyFromPem(keys.p)
      const encryptedSessionKey = publicKey.encrypt(sessionKey, 'RSA-OAEP', { 
        md: forge.md.sha256.create() 
      })

      // E. Upload Secure Envelope
      const { error: uploadError } = await supabase.from('responses').insert({ 
        form_id: id, 
        response: {
          key: forge.util.encode64(encryptedSessionKey), 
          iv: forge.util.encode64(iv), 
          tag: forge.util.encode64(tag), 
          data: forge.util.encode64(encryptedData)
        }
      })

      if (uploadError) throw uploadError
      
      alert('Success! Your response has been securely encrypted and submitted.')
      
      // Reset Form
      setAnswers({})
      setIndex(0)
      setConsentChecked(false)
      setLoading(false)
      
    } catch (e) {
      alert('Encryption/Upload Error: ' + e.message)
      setLoading(false)
    }
  }

  // ----------------------------------------------------------------
  // 3. NAVIGATION & VALIDATION
  // ----------------------------------------------------------------
  const handleNext = () => {
    const q = questions[index]
    const val = answers[q.id]
    
    // Check Required Fields
    if (q.required && !['title', 'info', 'consent'].includes(q.question_type)) {
      
      // Special validation for Contact Info object
      if (q.question_type === 'contact_info') {
        if (!val || !val['First Name'] || !val['Email']) {
          alert('Please fill in at least your First Name and Email.')
          return
        }
      }
      // General validation for strings/arrays
      else if (!val || (Array.isArray(val) && val.length === 0) || (typeof val === 'string' && val.trim() === '')) { 
        alert('This question is required. Please provide an answer.')
        return 
      }
    }

    // Check Consent
    if (q.question_type === 'consent' && !consentChecked) {
      alert("You must agree to the terms to continue.")
      return
    }

    // Navigate
    if (index < questions.length - 1) {
      setIndex(index + 1)
      setConsentChecked(false) 
    } else {
      handleSubmit()
    }
  }

  const updateContact = (field, text) => {
    const currentAnswers = answers[questions[index].id] || {}
    setAnswers({ 
      ...answers, 
      [questions[index].id]: { ...currentAnswers, [field]: text } 
    })
  }

  // ----------------------------------------------------------------
  // 4. RENDERER
  // ----------------------------------------------------------------
  if (loading && !questions.length) return <div className="loading-screen">Decrypting Secure Connection...</div>
  if (error) return <div className="error-screen">{error}</div>
  if (!questions.length) return <div className="loading-screen">No questions found for this survey.</div>

  const q = questions[index]
  const val = answers[q.id]

  // Calculate CSS variables for the current theme
  const isPro = theme.inputStyle === 'underline'
  const align = theme.align === 'left' ? 'flex-start' : 'center'
  const textAlign = theme.align === 'left' ? 'left' : 'center'
  
  const inputBorderCSS = isPro 
    ? `border: none; border-bottom: 2px solid ${theme.border}; border-radius: 0; background: transparent; padding: 10px 0;` 
    : `border: 2px solid ${theme.border}; border-radius: ${theme.radius}; background: ${theme.cardBg}; padding: 16px;`

  // Number Prefix (Typeform Arrow)
  const numberPrefix = theme.numberStyle === 'arrow' 
    ? <span className="arrow-prefix">{index + 1} <span style={{fontSize:'0.8em'}}>➜</span></span> 
    : null

  return (
    <div className="page-container">
      {/* GLOBAL CSS 
          Embedded directly to ensure zero-config styling 
      */}
      <style jsx global>{`
        body { 
          margin: 0; 
          background-color: ${theme.bg}; 
          color: ${theme.text}; 
          font-family: ${theme.font}; 
        }
        * { box-sizing: border-box; }
        
        .page-container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
        
        .progress-bar { width: 100%; height: 4px; background: #E5E7EB; position: fixed; top: 0; z-index: 50; }
        .progress-fill { height: 100%; background: ${theme.accent}; transition: width 0.5s ease; }
        
        .content-wrapper { flex-grow: 1; width: 100%; display: flex; justify-content: center; align-items: center; padding: 40px 20px; }
        
        .card {
          background: ${theme.cardBg};
          width: 100%;
          max-width: 1000px;
          min-height: 600px;
          border-radius: ${theme.radius};
          box-shadow: ${theme.shadow};
          padding: 60px 80px;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .badge-container { display: flex; justify-content: center; margin-bottom: 40px; }
        .secure-badge { 
          background: #DCFCE7; color: #15803D; font-size: 11px; font-weight: 800; 
          padding: 6px 14px; border-radius: 20px; border: 1px solid #BBF7D0; 
          text-transform: uppercase; letter-spacing: 0.5px;
        }

        .question-header { margin-bottom: 40px; }
        .question-title { 
          font-size: 28px; font-weight: 400; color: ${theme.text}; 
          text-align: ${textAlign}; margin-bottom: 10px; 
          display: flex; align-items: flex-start; justify-content: ${align}; 
          line-height: 1.4;
        }
        .arrow-prefix { color: ${theme.accent}; margin-right: 12px; font-weight: bold; }
        .required-star { color: #DC2626; margin-left: 4px; font-size: 0.8em; vertical-align: top; }
        
        .description { 
          font-size: 18px; color: #6B7280; text-align: ${textAlign}; 
          margin-top: 8px; font-style: italic; white-space: pre-wrap; 
        }

        /* INPUTS */
        .input-wrapper { width: 100%; display: flex; flex-direction: column; gap: 30px; max-width: 800px; margin: 0 auto; align-items: ${align}; }
        
        input, select, textarea {
          width: 100%; font-size: 24px; color: ${theme.text}; outline: none; transition: border-color 0.2s;
          ${inputBorderCSS}
        }
        input::placeholder, textarea::placeholder { color: #CBD5E1; opacity: 1; }
        input:focus, textarea:focus, select:focus { border-color: ${theme.accent}; }
        textarea { min-height: 150px; resize: none; }

        /* CHOICE BUTTONS */
        .choice-btn {
          width: 100%; text-align: left; padding: 15px 20px; 
          border: 1px solid ${isPro ? '#E5E5E5' : theme.border};
          border-radius: ${isPro ? '4px' : theme.radius}; 
          background: white; font-size: 20px; color: ${theme.text};
          cursor: pointer; transition: all 0.2s; display: flex; align-items: center;
        }
        .choice-btn:hover { background: #FAFAFA; border-color: ${theme.accent}; }
        .choice-btn.selected { 
          background: ${isPro ? '#F0F9FF' : theme.bg}; 
          border-color: ${theme.accent}; 
          color: ${theme.accent}; 
          font-weight: 500;
        }
        .choice-key { 
          width: 28px; height: 28px; border: 1px solid #D4D4D4; color: #D4D4D4; 
          font-size: 14px; display: flex; align-items: center; justify-content: center; 
          margin-right: 15px; border-radius: 4px; font-weight: bold;
        }
        .choice-btn.selected .choice-key { border-color: ${theme.accent}; color: ${theme.accent}; background: white; }

        /* CHECKBOXES */
        .checkbox-label { 
          display: flex; align-items: center; padding: 12px; cursor: pointer; 
          border: 1px solid transparent; transition: all 0.2s; width: 100%;
        }
        .checkbox-label:hover { background: #F9FAFB; }
        .checkbox-label.checked { background: #F0F9FF; border-color: ${theme.accent}; }
        
        .check-box {
          width: 24px; height: 24px; border: 2px solid ${theme.border}; 
          margin-right: 15px; display: flex; align-items: center; justify-content: center; 
          border-radius: 4px; flex-shrink: 0; background: white;
        }
        .checkbox-label.checked .check-box { background: ${theme.accent}; border-color: ${theme.accent}; color: white; font-weight: bold; font-size: 16px; }

        /* CONTACT GRID */
        .contact-group { width: 100%; margin-bottom: 20px; }
        .contact-label { font-size: 16px; font-weight: 600; color: ${theme.text}; margin-bottom: 8px; display: block; }

        /* RATING */
        .range-wrapper { width: 100%; text-align: center; padding: 20px 0; }
        input[type=range] { width: 100%; margin-bottom: 20px; accent-color: ${theme.accent}; cursor: pointer; border: none; padding: 0; }
        .range-value { font-size: 64px; font-weight: 800; color: ${theme.accent}; }

        /* FOOTER */
        .footer { margin-top: auto; padding-top: 60px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid ${theme.border}; }
        .btn-back { background: transparent; border: none; font-size: 18px; font-weight: 600; color: #9CA3AF; cursor: pointer; padding: 10px 20px; transition: color 0.2s; }
        .btn-back:hover { color: ${theme.text}; }
        .btn-back.hidden { visibility: hidden; }
        
        .btn-next { 
          background: ${theme.accent}; color: ${theme.btnText}; padding: 14px 42px; 
          border-radius: 4px; font-size: 20px; font-weight: 700; border: none; cursor: pointer; 
          transition: transform 0.1s; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .btn-next:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-next:active { transform: translateY(1px); }
        .btn-next:disabled { background: #E5E5E5; cursor: not-allowed; box-shadow: none; transform: none; }

        /* LOADING/ERROR */
        .loading-screen, .error-screen { height: 100vh; display: flex; justify-content: center; align-items: center; font-size: 18px; color: #64748B; font-family: sans-serif; }
        .error-screen { color: #DC2626; font-weight: bold; }

        /* RESPONSIVE */
        @media (max-width: 800px) {
          .card { padding: 30px; height: auto; min-height: 80vh; border: none; box-shadow: none; }
          .question-title { font-size: 24px; }
          input, select, textarea { font-size: 20px; }
        }
      `}</style>

      {/* TOP PROGRESS */}
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${((index + 1) / qs.length) * 100}%` }} /></div>

      <div className="content-wrapper">
        <div className="card">
          
          <div className="badge-container"><span className="secure-badge">🔒 End-to-End Encrypted</span></div>

          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            
            <div className="question-header">
              <h1 className="question-title">
                {prefix} 
                <span style={{flex: 1}}>{q.question_text}{q.required && <span className="required-star">*</span>}</span>
              </h1>
              {q.description && <div className="description">{q.description}</div>}
            </div>

            <div className="input-wrapper">
              
              {/* === INPUT TYPE SWITCH === */}

              {/* 1. SIMPLE TEXT (Text, Email, Phone, Number) */}
              {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
                <input 
                  type={q.question_type === 'number' ? 'number' : 'text'} 
                  placeholder="Type your answer here..." 
                  autoFocus 
                  value={val || ''} 
                  onChange={e => setAnswers({...ans, [q.id]: e.target.value})} 
                  onKeyDown={e => e.key === 'Enter' && handleNext()} 
                />
              )}

              {/* 2. LONG TEXT */}
              {q.question_type === 'long_text' && (
                <textarea 
                  placeholder="Type your answer here..." 
                  autoFocus 
                  value={val || ''} 
                  onChange={e => setAnswers({...ans, [q.id]: e.target.value})} 
                  style={{ 
                    border: isPro ? `1px solid ${theme.border}` : `2px solid ${theme.border}`, 
                    borderRadius: isPro ? 4 : theme.radius, 
                    padding: 15 
                  }} 
                />
              )}

              {/* 3. SINGLE CHOICE / YES_NO */}
              {['single_choice', 'yes_no'].includes(q.question_type) && (
                (q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                  <div key={i} onClick={() => setAnswers({...ans, [q.id]: opt})} className={`choice-btn ${val === opt ? 'selected' : ''}`}>
                    <div className="choice-key">{String.fromCharCode(65 + i)}</div>
                    {opt}
                  </div>
                ))
              )}

              {/* 4. CHECKBOXES */}
              {q.question_type === 'checkbox' && (
                q.options.map((opt, i) => {
                  const curr = val ? JSON.parse(val) : []
                  const chk = curr.includes(opt)
                  return (
                    <label key={i} className={`checkbox-label ${chk ? 'checked' : ''}`}>
                      <input type="checkbox" style={{display:'none'}} checked={chk} onChange={e => {
                        let n = [...curr]
                        e.target.checked ? n.push(opt) : n = n.filter(x => x !== opt)
                        setAnswers({...ans, [q.id]: JSON.stringify(n)})
                      }} />
                      <div className="check-box">{chk && '✓'}</div>
                      <span style={{fontSize: 20}}>{opt}</span>
                    </label>
                  )
                })
              )}

              {/* 5. DROPDOWN */}
              {q.question_type === 'dropdown' && (
                <select value={val || ''} onChange={e => setAnswers({...ans, [q.id]: e.target.value})}>
                  <option value="" disabled>Select an option...</option>
                  {q.options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
              )}

              {/* 6. RATING / SLIDER */}
              {['rating', 'slider'].includes(q.question_type) && (
                <div className="range-wrapper">
                  <input type="range" min={q.range_min || 1} max={q.range_max || 10} step={1} 
                    value={val || Math.ceil((q.range_max || 10) / 2)} 
                    onChange={e => setAnswers({...ans, [q.id]: e.target.value})} 
                  />
                  <div className="range-value">
                    {val || Math.ceil((q.range_max || 10) / 2)}
                  </div>
                </div>
              )}

              {/* 7. DATE */}
              {q.question_type === 'date' && (
                <input type="date" value={val || ''} onChange={e => setAnswers({...ans, [q.id]: e.target.value})} />
              )}

              {/* 8. CONTACT INFO (Multi-Field) */}
              {q.question_type === 'contact_info' && (
                <div style={{width: '100%'}}>
                  {['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Address', 'City', 'Zip'].map(f => (
                    <div key={f} className="contact-group">
                      <span className="contact-label">{f}</span>
                      <input 
                        type={f === 'Email' ? 'email' : 'text'} 
                        placeholder="..." 
                        value={(val || {})[f] || ''} 
                        onChange={e => updateContact(f, e.target.value)} 
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* 9. CONSENT */}
              {q.question_type === 'consent' && (
                <label className={`checkbox-label ${consentChecked ? 'checked' : ''}`} style={{alignItems:'flex-start'}}>
                  <input type="checkbox" style={{display:'none'}} checked={consentChecked} onChange={e => {
                    setConsentChecked(e.target.checked)
                    setAnswers({...ans, [q.id]: e.target.checked ? "Agreed" : ""})
                  }} />
                  <div className="check-box" style={{marginTop: 4}}>{consentChecked && '✓'}</div>
                  <div>
                    <div style={{fontWeight:'bold', fontSize: 18}}>I Agree</div>
                    <div style={{color: '#6B7280', fontSize: 14}}>I accept the terms and conditions presented above.</div>
                  </div>
                </label>
              )}

            </div>
          </div>

          <div className="footer">
            <button className={`btn-back ${idx === 0 ? 'hidden' : ''}`} onClick={() => setIdx(idx - 1)}>
              ← Back
            </button>
            <button className="btn-next" onClick={handleNext} disabled={q.question_type === 'consent' && !consentChecked}>
              {idx < qs.length - 1 ? (q.button_text || 'Next') : 'Submit'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}