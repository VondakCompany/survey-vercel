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
// ------------------------------------------------------------------
const THEMES = {
  pro: {
    name: "Professional",
    bg: "#FFFFFF",
    cardBg: "#FFFFFF",
    text: "#1A1A1A",
    accent: "#0445AF",      // Typeform Blue
    border: "#A3D5FF",      // Light Blue Underline
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
    accent: "#2563EB",      // Bright Blue
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
  // STATE
  // ----------------------------------------------------------------
  const [questions, setQuestions] = useState([]) 
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [keys, setKeys] = useState({ q: null, p: null })
  const [theme, setTheme] = useState(THEMES.pro)
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)

  // ----------------------------------------------------------------
  // 1. INITIALIZATION
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!id) return

    const initializeForm = async () => {
      try {
        // A. Fetch Encryption Keys from Secure DB Store
        const { data: keyData, error: keyError } = await supabase
          .from('survey_keys')
          .select('*')
          .eq('form_id', id)
          .single()

        if (keyError || !keyData) {
          throw new Error("Survey not found or currently unpublished.")
        }

        // B. Fetch Theme Metadata
        const { data: formData } = await supabase
          .from('forms')
          .select('theme')
          .eq('id', id)
          .single()
        
        if (formData && formData.theme && THEMES[formData.theme]) {
          setTheme(THEMES[formData.theme])
        }

        // C. Decode Keys
        const qKey = forge.util.decode64(keyData.q_key)
        setKeys({ q: qKey, p: keyData.p_key })

        // D. Fetch Questions
        const { data: qData, error: qError } = await supabase
          .from('questions')
          .select('*')
          .eq('form_id', id)
          .order('order')

        if (qError) throw qError

        // E. Decrypt Content
        const decryptedQuestions = qData.map(row => ({
          ...row,
          question_text: decryptAES(row.question_text, qKey),
          description: decryptAES(row.description, qKey),
          options: decryptAES(row.options, qKey) || []
        }))

        setQuestions(decryptedQuestions)
        setLoading(false)

      } catch (e) {
        console.error("Init Error:", e)
        setError(e.message || "Failed to load secure survey.")
        setLoading(false)
      }
    }

    initializeForm()
  }, [id])

  // ----------------------------------------------------------------
  // CRYPTO HELPER
  // ----------------------------------------------------------------
  const decryptAES = (b64Cipher, key) => {
    if (!b64Cipher) return ""
    try {
      const raw = forge.util.decode64(b64Cipher)
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
      
      const payload = JSON.stringify(answers)
      const sKey = forge.random.getBytesSync(32)
      const iv = forge.random.getBytesSync(12)

      const c = forge.cipher.createCipher('AES-GCM', sKey)
      c.start({ iv })
      c.update(forge.util.createBuffer(payload))
      c.finish()
      
      const encryptedData = cipher.output.getBytes()
      const tag = cipher.mode.tag.getBytes()

      const publicKey = forge.pki.publicKeyFromPem(keys.p)
      const encryptedSessionKey = publicKey.encrypt(sKey, 'RSA-OAEP', { 
        md: forge.md.sha256.create() 
      })

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
    
    // Validation
    if (q.required && !['title', 'info', 'consent'].includes(q.question_type)) {
      if (q.question_type === 'contact_info') {
        if (!val || !val['First Name'] || !val['Email']) {
          alert('Please fill in at least your First Name and Email.')
          return
        }
      }
      else if (!val || (Array.isArray(val) && val.length === 0) || (typeof val === 'string' && val.trim() === '')) { 
        alert('This question is required.')
        return 
      }
    }

    if (q.question_type === 'consent' && !consentChecked) {
      alert("You must agree to continue.")
      return
    }

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
  if (loading && !questions.length) return <div className="loading-screen">Loading Secure Survey...</div>
  if (error) return <div className="error-screen">{error}</div>
  if (!questions.length) return <div className="loading-screen">No questions found.</div>

  const q = questions[index]
  const val = answers[q.id]

  // CSS Variables
  const isPro = theme.inputStyle === 'underline'
  const align = theme.align === 'left' ? 'flex-start' : 'center'
  const textAlign = theme.align === 'left' ? 'left' : 'center'
  
  const inputBorderCSS = isPro 
    ? `border: none; border-bottom: 2px solid ${theme.border}; border-radius: 0; background: transparent; padding: 10px 0;` 
    : `border: 2px solid ${theme.border}; border-radius: ${theme.radius}; background: ${theme.cardBg}; padding: 16px;`

  const numberPrefix = theme.numberStyle === 'arrow' 
    ? <span className="arrow-prefix">{index + 1} <span style={{fontSize:'0.8em'}}>➜</span></span> 
    : null

  return (
    <div className="page-container">
      <style jsx global>{`
        body { margin: 0; background-color: ${theme.bg}; color: ${theme.text}; font-family: ${theme.font}; }
        * { box-sizing: border-box; }
        
        .page-container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
        
        .progress-bar { width: 100%; height: 4px; background: #E5E7EB; position: fixed; top: 0; z-index: 50; }
        .progress-fill { height: 100%; background: ${theme.accent}; transition: width 0.5s ease; }
        
        .content-wrapper { flex-grow: 1; width: 100%; display: flex; justify-content: center; align-items: center; padding: 40px 20px; }
        
        .card {
          background: ${theme.cardBg}; width: 100%; max-width: 1000px; min-height: 600px;
          border-radius: ${theme.radius}; box-shadow: ${theme.shadow};
          padding: 60px 80px; display: flex; flex-direction: column; position: relative;
        }

        .badge-container { display: flex; justify-content: center; margin-bottom: 40px; }
        .secure-badge { background: #F0FDF4; color: #15803D; font-size: 11px; font-weight: 800; padding: 6px 14px; border-radius: 20px; border: 1px solid #BBF7D0; text-transform: uppercase; }

        .question-header { margin-bottom: 40px; }
        .question-title { 
          font-size: 28px; font-weight: 400; color: ${theme.text}; text-align: ${textAlign}; 
          margin-bottom: 10px; display: flex; align-items: flex-start; justify-content: ${align}; 
          line-height: 1.4;
        }
        .arrow-prefix { color: ${theme.accent}; margin-right: 12px; font-weight: bold; }
        .required-star { color: #DC2626; margin-left: 4px; font-size: 0.8em; vertical-align: top; }
        
        .description { font-size: 18px; color: #6B7280; text-align: ${textAlign}; margin-top: 8px; font-style: italic; white-space: pre-wrap; }

        .input-wrapper { width: 100%; display: flex; flex-direction: column; gap: 30px; max-width: 800px; margin: 0 auto; align-items: ${align}; }
        
        input, select, textarea { width: 100%; font-size: 24px; color: ${theme.text}; outline: none; transition: border-color 0.2s; ${inputBorderCSS} }
        input::placeholder, textarea::placeholder { color: #A3D5FF; opacity: 1; }
        input:focus, textarea:focus, select:focus { border-color: ${theme.accent}; }
        textarea { min-height: 150px; resize: none; }

        .choice-btn {
          width: 100%; text-align: left; padding: 15px 20px; 
          border: 1px solid ${isPro ? '#E5E5E5' : theme.border};
          border-radius: ${isPro ? '4px' : theme.radius}; 
          background: white; font-size: 20px; color: ${theme.text};
          cursor: pointer; transition: all 0.2s; display: flex; align-items: center;
        }
        .choice-btn:hover { background: #FAFAFA; border-color: ${theme.accent}; }
        .choice-btn.selected { background: ${isPro ? '#F0F9FF' : theme.bg}; border-color: ${theme.accent}; color: ${theme.accent}; font-weight: 500; }
        .choice-key { width: 28px; height: 28px; border: 1px solid #D4D4D4; color: #D4D4D4; font-size: 14px; display: flex; align-items: center; justify-content: center; margin-right: 15px; border-radius: 4px; font-weight: bold; }
        .choice-btn.selected .choice-key { border-color: ${theme.accent}; color: ${theme.accent}; background: white; }

        .checkbox-label { display: flex; align-items: center; padding: 12px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; width: 100%; }
        .checkbox-label:hover { background: #F9FAFB; }
        .checkbox-label.checked { background: #F0F9FF; border-color: ${theme.accent}; }
        .check-box { width: 24px; height: 24px; border: 2px solid ${theme.border}; margin-right: 15px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0; background: white; }
        .checkbox-label.checked .check-box { background: ${theme.accent}; border-color: ${theme.accent}; color: white; font-weight: bold; font-size: 16px; }

        .contact-group { width: 100%; margin-bottom: 20px; }
        .contact-label { font-size: 16px; font-weight: 600; color: ${theme.text}; margin-bottom: 8px; display: block; }

        .range-wrapper { width: 100%; text-align: center; padding: 20px 0; }
        input[type=range] { width: 100%; margin-bottom: 20px; accent-color: ${theme.accent}; cursor: pointer; border: none; padding: 0; }
        .range-value { font-size: 64px; font-weight: 800; color: ${theme.accent}; }

        .footer { margin-top: auto; padding-top: 60px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid ${theme.border}; }
        .btn-back { background: transparent; border: none; font-size: 18px; font-weight: 600; color: #9CA3AF; cursor: pointer; padding: 10px 20px; transition: color 0.2s; }
        .btn-back:hover { color: ${theme.text}; }
        .btn-back.hidden { visibility: hidden; }
        .btn-next { background: ${theme.accent}; color: ${theme.btnText}; padding: 14px 42px; border-radius: 4px; font-size: 20px; font-weight: 700; border: none; cursor: pointer; transition: transform 0.1s; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .btn-next:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-next:active { transform: translateY(1px); }
        .btn-next:disabled { background: #E5E5E5; cursor: not-allowed; box-shadow: none; transform: none; }

        .loading-screen, .error-screen { height: 100vh; display: flex; justify-content: center; align-items: center; font-size: 18px; color: #64748B; font-family: sans-serif; }
        .error-screen { color: #DC2626; font-weight: bold; }
        
        @media (max-width: 800px) {
          .card { padding: 30px; height: auto; min-height: 80vh; border: none; box-shadow: none; }
          .question-title { font-size: 24px; }
          input, select, textarea { font-size: 20px; }
        }
      `}</style>

      <div className="progress-bar"><div className="progress-fill" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>

      <div className="content-wrapper">
        <div className="card">
          
          <div className="badge-container"><span className="secure-badge">🔒 End-to-End Encrypted</span></div>

          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            
            <div className="question-header">
              <h1 className="question-title">
                {numberPrefix} 
                <span style={{flex: 1}}>{q.question_text}{q.required && <span className="required-star">*</span>}</span>
              </h1>
              {q.description && <div className="description">{q.description}</div>}
            </div>

            <div className="input-wrapper">
              
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

              {['single_choice', 'yes_no'].includes(q.question_type) && (
                (q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                  <div key={i} onClick={() => setAnswers({...ans, [q.id]: opt})} className={`choice-btn ${val === opt ? 'selected' : ''}`}>
                    <div className="choice-key">{String.fromCharCode(65 + i)}</div>
                    {opt}
                  </div>
                ))
              )}

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

              {q.question_type === 'dropdown' && (
                <select value={val || ''} onChange={e => setAnswers({...ans, [q.id]: e.target.value})}>
                  <option value="" disabled>Select an option...</option>
                  {q.options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
              )}

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

              {q.question_type === 'date' && (
                <input type="date" value={val || ''} onChange={e => setAnswers({...ans, [q.id]: e.target.value})} />
              )}

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
            <button className={`btn-back ${index === 0 ? 'hidden' : ''}`} onClick={() => setIndex(index - 1)}>
              ← Back
            </button>
            <button className="btn-next" onClick={handleNext} disabled={q.question_type === 'consent' && !consentChecked}>
              {index < questions.length - 1 ? (q.button_text || 'Next') : 'Submit'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}