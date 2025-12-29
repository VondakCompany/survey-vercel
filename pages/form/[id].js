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
// THEME ENGINE (Matches Python Logic)
// ------------------------------------------------------------------
const THEME = {
  bg: "#F3F4F6", // Slate 100
  cardBg: "#FFFFFF",
  text: "#111827",
  subtext: "#6B7280",
  accent: "#0445AF",      // Typeform Blue
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

  // ----------------------------------------------------------------
  // 1. INITIALIZATION
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!id) return

    const initializeForm = async () => {
      try {
        // A. Fetch Encryption Keys
        const { data: keyData, error: keyError } = await supabase
          .from('survey_keys')
          .select('*')
          .eq('form_id', id)
          .single()

        if (keyError || !keyData) {
          throw new Error("Survey not found or currently unpublished.")
        }

        // B. Decode Keys
        const qKey = forge.util.decode64(keyData.q_key)
        setKeys({ q: qKey, p: keyData.p_key })

        // C. Fetch Questions
        const { data: qData, error: qError } = await supabase
          .from('questions')
          .select('*')
          .eq('form_id', id)
          .order('order')

        if (qError) throw qError

        // D. Decrypt Content
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
  // CRYPTO HELPER (AES-GCM)
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
      
      const encryptedData = c.output.getBytes()
      const tag = c.mode.tag.getBytes()

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
    
    // Skip validation for Title/Info slides
    if (['title', 'info'].includes(q.question_type)) {
       goNext()
       return
    }

    // Consent Validation
    if (q.question_type === 'consent' && !consentChecked) {
      alert("You must agree to continue.")
      return
    }

    // Required Field Validation
    if (q.required) {
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

    goNext()
  }

  const goNext = () => {
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

  // Dynamic Alignment
  const isCentered = ['title', 'info'].includes(q.question_type)
  const align = isCentered ? 'center' : 'flex-start'
  const textAlign = isCentered ? 'center' : 'left'

  // Typography Scale
  const titleSize = q.question_type === 'title' ? '40px' : (isCentered ? '32px' : '28px')
  const titleWeight = q.question_type === 'title' ? '800' : '600'
  
  return (
    <div className="page-container">
      <style jsx global>{`
        body { margin: 0; background-color: ${THEME.bg}; color: ${THEME.text}; font-family: ${THEME.font}; }
        * { box-sizing: border-box; }
        
        .page-container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
        
        .progress-bar { width: 100%; height: 4px; background: #E5E7EB; position: fixed; top: 0; z-index: 50; }
        .progress-fill { height: 100%; background: ${THEME.accent}; transition: width 0.5s ease; }
        
        .content-wrapper { flex-grow: 1; width: 100%; display: flex; justify-content: center; align-items: center; padding: 40px 20px; }
        
        .card {
          background: ${THEME.cardBg}; width: 100%; max-width: 900px; min-height: 600px;
          border-radius: ${THEME.radius}; box-shadow: ${THEME.shadow};
          padding: 60px 80px; display: flex; flex-direction: column; position: relative;
        }

        .badge-container { display: flex; justify-content: center; margin-bottom: 40px; }
        .secure-badge { background: #F0FDF4; color: #15803D; font-size: 11px; font-weight: 800; padding: 6px 14px; border-radius: 20px; border: 1px solid #BBF7D0; text-transform: uppercase; letter-spacing: 0.5px; }

        .question-header { margin-bottom: 40px; width: 100%; }
        .question-title { 
          font-size: ${titleSize}; font-weight: ${titleWeight}; color: ${THEME.text}; text-align: ${textAlign}; 
          margin-bottom: 10px; line-height: 1.3;
        }
        .required-star { color: #DC2626; margin-left: 4px; font-size: 0.6em; vertical-align: top; }
        
        .description { font-size: 20px; color: ${THEME.subtext}; text-align: ${textAlign}; margin-top: 12px; font-weight: 300; white-space: pre-wrap; }

        .input-wrapper { width: 100%; display: flex; flex-direction: column; gap: 20px; max-width: 800px; margin: 0 auto; align-items: ${align}; }
        
        /* Typeform Underline Input */
        .tf-input {
            width: 100%; font-size: 28px; color: ${THEME.accent}; 
            border: none; border-bottom: 2px solid #E5E7EB; 
            background: transparent; padding: 10px 0; outline: none;
            transition: border-color 0.3s;
        }
        .tf-input::placeholder { color: #D1D5DB; }
        .tf-input:focus { border-bottom-color: ${THEME.accent}; }

        /* Choice Buttons */
        .choice-btn {
          width: 100%; text-align: left; padding: 16px 24px; 
          border: 1px solid ${THEME.border}; border-radius: 6px; 
          background: white; font-size: 18px; color: ${THEME.text};
          cursor: pointer; transition: all 0.2s; display: flex; align-items: center;
        }
        .choice-btn:hover { background: #FAFAFA; border-color: ${THEME.accent}; }
        .choice-btn.selected { background: #F0F9FF; border-color: ${THEME.accent}; color: ${THEME.accent}; font-weight: 600; }
        .choice-key { width: 32px; height: 32px; border: 1px solid #D4D4D4; color: #999; font-size: 14px; display: flex; align-items: center; justify-content: center; margin-right: 15px; border-radius: 4px; font-weight: bold; text-transform: uppercase; }
        .choice-btn.selected .choice-key { border-color: ${THEME.accent}; color: ${THEME.accent}; background: white; }

        /* Checkbox */
        .checkbox-label { display: flex; align-items: center; padding: 15px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; width: 100%; border-radius: 6px; }
        .checkbox-label:hover { background: #F9FAFB; }
        .checkbox-label.checked { background: #F0F9FF; border: 1px solid ${THEME.accent}; }
        .check-box { width: 24px; height: 24px; border: 2px solid #D1D5DB; margin-right: 15px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0; background: white; transition: all 0.2s; }
        .checkbox-label.checked .check-box { background: ${THEME.accent}; border-color: ${THEME.accent}; color: white; font-weight: bold; font-size: 16px; }

        .footer { margin-top: auto; padding-top: 60px; display: flex; justify-content: space-between; align-items: center; width: 100%; }
        
        .btn-back { background: transparent; border: none; font-size: 16px; font-weight: 600; color: #9CA3AF; cursor: pointer; padding: 10px 20px; transition: color 0.2s; }
        .btn-back:hover { color: ${THEME.text}; }
        .btn-back.hidden { visibility: hidden; }
        
        .btn-next { 
            background: ${THEME.accent}; color: white; 
            padding: 12px 36px; border-radius: 4px; 
            font-size: 20px; font-weight: 700; border: none; 
            cursor: pointer; transition: all 0.2s; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
        }
        .btn-next:hover { transform: translateY(-2px); box-shadow: 0 6px 8px rgba(0,0,0,0.15); }
        .btn-next:active { transform: translateY(0); }
        .btn-next:disabled { background: #E5E5E5; color: #A3A3A3; cursor: not-allowed; box-shadow: none; transform: none; }

        .loading-screen, .error-screen { height: 100vh; display: flex; justify-content: center; align-items: center; font-size: 18px; color: #64748B; font-family: sans-serif; }
        .error-screen { color: #DC2626; font-weight: bold; }
        
        .slide-counter { position: absolute; bottom: 30px; right: 40px; font-size: 14px; font-weight: 600; color: #9CA3AF; }

        @media (max-width: 800px) {
          .card { padding: 30px; height: auto; min-height: 80vh; border: none; box-shadow: none; border-radius: 0; }
          .question-title { font-size: 24px; text-align: left; }
          .description { text-align: left; }
          .input-wrapper { align-items: flex-start; }
          .tf-input { font-size: 22px; }
        }
      `}</style>

      <div className="progress-bar"><div className="progress-fill" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>

      <div className="content-wrapper">
        <div className="card">
          
          <div className="badge-container"><span className="secure-badge">🔒 Secure Survey</span></div>

          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            
            <div className="question-header">
              <h1 className="question-title">
                {q.question_text}{q.required && <span className="required-star">*</span>}
              </h1>
              {q.description && <div className="description">{q.description}</div>}
            </div>

            <div className="input-wrapper">
              
              {/* TEXT INPUTS */}
              {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
                <input 
                  className="tf-input"
                  type={q.question_type === 'number' ? 'number' : 'text'} 
                  placeholder="Type your answer here..." 
                  autoFocus 
                  value={val || ''} 
                  onChange={e => setAnswers({...answers, [q.id]: e.target.value})} 
                  onKeyDown={e => e.key === 'Enter' && handleNext()} 
                />
              )}

              {/* LONG TEXT */}
              {q.question_type === 'long_text' && (
                <textarea 
                  className="tf-input"
                  placeholder="Type your answer here..." 
                  autoFocus 
                  value={val || ''} 
                  onChange={e => setAnswers({...answers, [q.id]: e.target.value})} 
                  style={{ minHeight: 120, border: 'none', borderBottom: `2px solid ${THEME.border}`, background: 'transparent', resize: 'none' }}
                />
              )}

              {/* CHOICES */}
              {['single_choice', 'yes_no'].includes(q.question_type) && (
                (q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                  <div key={i} onClick={() => { setAnswers({...answers, [q.id]: opt}); setTimeout(handleNext, 200); }} className={`choice-btn ${val === opt ? 'selected' : ''}`}>
                    <div className="choice-key">{String.fromCharCode(65 + i)}</div>
                    {opt}
                  </div>
                ))
              )}

              {/* CHECKBOX */}
              {q.question_type === 'checkbox' && (
                q.options.map((opt, i) => {
                  const curr = val ? JSON.parse(val) : []
                  const chk = curr.includes(opt)
                  return (
                    <label key={i} className={`checkbox-label ${chk ? 'checked' : ''}`}>
                      <input type="checkbox" style={{display:'none'}} checked={chk} onChange={e => {
                        let n = [...curr]
                        e.target.checked ? n.push(opt) : n = n.filter(x => x !== opt)
                        setAnswers({...answers, [q.id]: JSON.stringify(n)})
                      }} />
                      <div className="check-box">{chk && '✓'}</div>
                      <span style={{fontSize: 18}}>{opt}</span>
                    </label>
                  )
                })
              )}

              {/* DROPDOWN */}
              {q.question_type === 'dropdown' && (
                <select className="tf-input" value={val || ''} onChange={e => setAnswers({...answers, [q.id]: e.target.value})}>
                  <option value="" disabled>Select an option...</option>
                  {q.options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
              )}

              {/* SLIDER / RATING */}
              {['rating', 'slider'].includes(q.question_type) && (
                <div style={{width:'100%', textAlign:'center'}}>
                  <input type="range" min={q.range_min || 1} max={q.range_max || 10} step={1} 
                    style={{width:'100%', accentColor: THEME.accent, cursor:'pointer'}}
                    value={val || Math.ceil((q.range_max || 10) / 2)} 
                    onChange={e => setAnswers({...answers, [q.id]: e.target.value})} 
                  />
                  <div style={{fontSize: 48, fontWeight: 800, color: THEME.accent, marginTop: 20}}>
                    {val || Math.ceil((q.range_max || 10) / 2)}
                  </div>
                </div>
              )}

              {/* CONTACT INFO */}
              {q.question_type === 'contact_info' && (
                <div style={{width: '100%'}}>
                  {['First Name', 'Last Name', 'Email', 'Phone'].map(f => (
                    <div key={f} style={{marginBottom: 20}}>
                      <label style={{fontSize: 14, fontWeight: 600, color: THEME.text, display:'block', marginBottom: 5}}>{f}</label>
                      <input 
                        className="tf-input"
                        style={{fontSize: 20}}
                        type={f === 'Email' ? 'email' : 'text'} 
                        placeholder="..." 
                        value={(val || {})[f] || ''} 
                        onChange={e => updateContact(f, e.target.value)} 
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* CONSENT (New Design) */}
              {q.question_type === 'consent' && (
                <label className={`checkbox-label ${consentChecked ? 'checked' : ''}`} style={{alignItems:'flex-start', padding: 20}}>
                  <input type="checkbox" style={{display:'none'}} checked={consentChecked} onChange={e => {
                    setConsentChecked(e.target.checked)
                    setAnswers({...answers, [q.id]: e.target.checked ? "Agreed" : ""})
                  }} />
                  <div className="check-box" style={{marginTop: 4, width: 28, height: 28}}>{consentChecked && '✓'}</div>
                  <div>
                    <div style={{fontWeight:'bold', fontSize: 18, marginBottom: 4}}>I accept the terms</div>
                    <div style={{color: '#6B7280', fontSize: 14}}>I have read and agree to the terms and conditions above.</div>
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
              {index < questions.length - 1 ? (q.button_text || 'Next') : 'Submit'} ➜
            </button>
          </div>
          
          <div className="slide-counter">{index + 1} / {questions.length}</div>

        </div>
      </div>
    </div>
  )
}
