import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import forge from 'node-forge'

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// --- THEME DEFINITIONS ---
// These match the Python "Theme Engine" exactly.
const THEMES = {
  pro: {
    bg: "#FAFAFA",
    cardBg: "#FFFFFF",
    text: "#1A1A1A",
    accent: "#000000",
    border: "#E5E5E5",
    radius: "4px",
    btnText: "#FFFFFF",
    shadow: "0 4px 20px rgba(0,0,0,0.08)"
  },
  pop: {
    bg: "#F8FAFC",
    cardBg: "#FFFFFF",
    text: "#1E293B",
    accent: "#2563EB",
    border: "#E2E8F0",
    radius: "16px",
    btnText: "#FFFFFF",
    shadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15)"
  }
}

export default function FormPage() {
  const router = useRouter()
  const { id } = router.query
  
  // --- STATE ---
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [keys, setKeys] = useState({ q: null, p: null })
  const [theme, setTheme] = useState(THEMES.pro) // Default to Pro
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)

  // --- 1. INITIALIZATION & DECRYPTION ---
  useEffect(() => {
    if (!id) return

    // Parse URL Hash safely (Handles special chars like '+' correctly)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const qKeyB64 = hashParams.get('q')
    const pKeyB64 = hashParams.get('p')

    if (!qKeyB64 || !pKeyB64) {
      setError('MISSING KEYS: Use the secure link provided by the software.')
      setLoading(false)
      return
    }

    try {
      const qKey = forge.util.decode64(qKeyB64)
      const pKey = forge.util.decode64(pKeyB64)
      setKeys({ q: qKey, p: pKey })

      const fetchData = async () => {
        // A. Fetch Theme Metadata
        const { data: formData, error: formError } = await supabase
          .from('forms')
          .select('theme')
          .eq('id', id)
          .single()
        
        if (formData && formData.theme && THEMES[formData.theme]) {
          setTheme(THEMES[formData.theme])
        }

        // B. Fetch Questions
        const { data: rawData, error: dbError } = await supabase
          .from('questions')
          .select('*')
          .eq('form_id', id)
          .order('order')

        if (dbError) throw dbError

        // C. Decrypt Content
        const decrypted = rawData.map(row => {
          return {
            ...row,
            question_text: decryptAES(row.question_text, qKey),
            description: decryptAES(row.description, qKey),
            options: decryptAES(row.options, qKey) || []
          }
        })
        setQuestions(decrypted)
        setLoading(false)
      }
      fetchData()
    } catch (e) {
      console.error(e)
      setError("Secure Link Invalid or Corrupted.")
      setLoading(false)
    }
  }, [id])

  // --- CRYPTO HELPER ---
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
      if (decipher.finish()) return JSON.parse(decipher.output.toString())
      return "[Decryption Failed]"
    } catch (e) { return "" }
  }

  // --- 2. SUBMISSION LOGIC ---
  const handleSubmit = async () => {
    try {
      const payload = JSON.stringify(answers)
      
      // Generate Ephemeral Session Key
      const sessionKey = forge.random.getBytesSync(32)
      const iv = forge.random.getBytesSync(12)

      // Encrypt Data (AES-GCM)
      const cipher = forge.cipher.createCipher('AES-GCM', sessionKey)
      cipher.start({ iv: iv })
      cipher.update(forge.util.createBuffer(payload))
      cipher.finish()
      const encryptedData = cipher.output.getBytes()
      const tag = cipher.mode.tag.getBytes()

      // Encrypt Session Key (RSA-OAEP)
      const pem = `-----BEGIN PUBLIC KEY-----\n${forge.util.encode64(keys.p).match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`
      const publicKey = forge.pki.publicKeyFromPem(pem)
      const encryptedSessionKey = publicKey.encrypt(sessionKey, 'RSA-OAEP', { md: forge.md.sha256.create() })

      // Upload
      await supabase.from('responses').insert({ 
        form_id: id, 
        response: {
          key: forge.util.encode64(encryptedSessionKey), 
          iv: forge.util.encode64(iv), 
          tag: forge.util.encode64(tag), 
          data: forge.util.encode64(encryptedData)
        }
      })
      
      alert('Response encrypted & submitted successfully!')
      setAnswers({})
      setIndex(0)
      setConsentChecked(false)
      
    } catch (e) {
      alert('Encryption Error: ' + e.message)
    }
  }

  // --- 3. NAVIGATION & VALIDATION ---
  const handleNext = () => {
    const q = questions[index]
    const val = answers[q.id]
    
    // Check Required
    if (q.required && !['title','info'].includes(q.question_type)) {
      if (q.question_type === 'consent' && !consentChecked) {
        alert("You must agree to continue.")
        return
      }
      if (q.question_type === 'contact_info') {
        if (!val || !val['Name']) {
          alert('Name is required.')
          return
        }
      }
      // General check
      if (!val || (Array.isArray(val) && val.length === 0) || (typeof val === 'string' && val.trim() === '')) { 
        alert('This question is required.')
        return 
      }
    }

    if (index < questions.length - 1) {
      setIndex(index + 1)
      setConsentChecked(false) 
    } else {
      handleSubmit()
    }
  }

  // Helper for Contact Info inputs
  const updateContact = (field, text) => {
    const current = answers[questions[index].id] || {}
    setAnswers({ ...answers, [questions[index].id]: { ...current, [field]: text } })
  }

  // --- 4. RENDERER ---
  if (loading) return <div className="loading">Decrypting Secure Connection...</div>
  if (error) return <div className="error">{error}</div>
  if (questions.length === 0) return <div className="loading">No questions found.</div>

  const q = questions[index]
  const val = answers[q.id]

  return (
    <div className="page-container">
      {/* FULL CSS STYLING (Embedded) 
          This ensures it works without Tailwind or external CSS files.
          It uses the variables from the 'theme' state.
      */}
      <style jsx global>{`
        body { margin: 0; background-color: ${theme.bg}; color: ${theme.text}; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; }
        * { box-sizing: border-box; }
        
        .page-container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
        
        /* PROGRESS BAR */
        .progress-bar { width: 100%; height: 6px; background: ${theme.border}; position: fixed; top: 0; z-index: 50; }
        .progress-fill { height: 100%; background: ${theme.accent}; transition: width 0.5s ease; }
        
        .content-wrapper { flex-grow: 1; width: 100%; display: flex; justify-content: center; align-items: center; padding: 40px 20px; }
        
        /* THE MAIN CARD */
        .card {
          background: ${theme.cardBg};
          width: 100%;
          max-width: 1280px; /* 16:9 HD Width */
          aspect-ratio: 16/9;
          border-radius: ${theme.radius};
          box-shadow: ${theme.shadow};
          border: 1px solid ${theme.border};
          padding: 60px 80px;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        /* BADGE */
        .badge-container { display: flex; justify-content: center; margin-bottom: 30px; }
        .secure-badge { 
          background: #DCFCE7; color: #15803D; font-size: 11px; font-weight: 800; 
          padding: 6px 14px; border-radius: 20px; letter-spacing: 1px; text-transform: uppercase; 
          border: 1px solid #BBF7D0; display: flex; align-items: center; gap: 6px;
        }

        /* TYPOGRAPHY */
        .question-title { font-size: 36px; font-weight: 800; color: ${theme.text}; text-align: center; margin: 0 0 15px 0; line-height: 1.2; }
        .required-star { color: #DC2626; margin-left: 4px; }
        .description { font-size: 20px; color: #64748B; text-align: center; margin: 0 0 40px 0; line-height: 1.6; white-space: pre-wrap; }

        /* INPUTS */
        .input-group { width: 100%; display: flex; flex-direction: column; gap: 20px; max-width: 800px; margin: 0 auto; }
        
        input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], select, textarea {
          width: 100%; padding: 20px; font-size: 20px; 
          border: 2px solid ${theme.border}; 
          border-radius: ${theme.radius};
          background: ${theme.cardBg}; 
          color: ${theme.text}; 
          outline: none; 
          transition: all 0.2s;
        }
        input:focus, textarea:focus, select:focus { border-color: ${theme.accent}; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
        
        textarea { min-height: 180px; resize: none; }

        /* CHOICE BUTTONS */
        .choice-btn {
          width: 100%; text-align: left; padding: 20px 24px; 
          border: 2px solid ${theme.border};
          border-radius: ${theme.radius}; 
          background: ${theme.cardBg}; 
          font-size: 20px; font-weight: 500; color: ${theme.text};
          cursor: pointer; transition: all 0.2s; display: flex; align-items: center;
        }
        .choice-btn:hover { background: ${theme.bg}; border-color: #CBD5E1; }
        .choice-btn.selected { border-color: ${theme.accent}; background: ${theme.bg}; color: ${theme.accent}; font-weight: 700; }
        
        /* CHECKBOX & CONSENT */
        .checkbox-label {
          display: flex; align-items: center; padding: 20px; 
          border: 2px solid ${theme.border}; 
          border-radius: ${theme.radius}; 
          cursor: pointer; transition: all 0.2s;
        }
        .checkbox-label:hover { background: ${theme.bg}; }
        .checkbox-label.checked { border-color: ${theme.accent}; background: ${theme.bg}; }
        
        .check-box {
          width: 28px; height: 28px; border: 2px solid ${theme.border}; 
          border-radius: 6px; background: white;
          margin-right: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .checkbox-label.checked .check-box { background: ${theme.accent}; border-color: ${theme.accent}; color: ${theme.btnText}; }

        /* RATING / SLIDER */
        .range-wrapper { padding: 20px 0; text-align: center; }
        input[type=range] { width: 100%; margin-bottom: 20px; accent-color: ${theme.accent}; cursor: pointer; }
        .range-value { font-size: 56px; font-weight: 800; color: ${theme.accent}; }

        /* CONTACT GRID */
        .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        
        /* FOOTER */
        .footer { margin-top: auto; padding-top: 40px; display: flex; justify-content: space-between; border-top: 1px solid ${theme.border}; }
        
        .btn-back { background: transparent; border: none; font-size: 18px; font-weight: 700; color: #94A3B8; cursor: pointer; padding: 10px 20px; }
        .btn-back:hover { color: #64748B; }
        .btn-back.hidden { visibility: hidden; }

        .btn-next { 
          background: ${theme.accent}; color: ${theme.btnText}; 
          padding: 16px 48px; border-radius: ${theme.radius}; 
          font-size: 20px; font-weight: 700; border: none; cursor: pointer; 
          box-shadow: 0 4px 10px rgba(0,0,0,0.1); transition: transform 0.1s;
        }
        .btn-next:hover { opacity: 0.9; transform: translateY(-2px); }
        .btn-next:active { transform: scale(0.98); }
        .btn-next:disabled { background: #CBD5E1; cursor: not-allowed; box-shadow: none; transform: none; }

        /* UTILS */
        .loading, .error { height: 100vh; display: flex; justify-content: center; align-items: center; font-size: 18px; color: #64748B; }
        .error { color: #DC2626; font-weight: bold; }

        /* RESPONSIVE */
        @media (max-width: 1000px) {
          .card { padding: 40px; height: auto; min-height: 80vh; aspect-ratio: auto; }
          .contact-grid { grid-template-columns: 1fr; }
          .question-title { font-size: 28px; }
        }
      `}</style>

      {/* TOP PROGRESS */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="content-wrapper">
        <div className="card">
          
          <div className="badge-container">
            <span className="secure-badge">🔒 End-to-End Encrypted</span>
          </div>

          {/* CONTENT AREA (Centers vertically) */}
          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            
            <h1 className="question-title">
              {q.question_text}
              {q.required && <span className="required-star">*</span>}
            </h1>
            
            {q.description && <div className="description">{q.description}</div>}

            <div className="input-group">
              
              {/* 1. SIMPLE TEXT INPUTS */}
              {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
                <input 
                  type={q.question_type === 'number' ? 'number' : 'text'} 
                  placeholder="Type your answer here..." 
                  autoFocus
                  value={val || ''} 
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} 
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                />
              )}

              {/* 2. LONG TEXT */}
              {q.question_type === 'long_text' && (
                <textarea 
                  placeholder="Type a longer answer..."
                  autoFocus
                  value={val || ''} 
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} 
                />
              )}

              {/* 3. CHOICE BUTTONS (Single/YesNo) */}
              {['single_choice', 'yes_no'].includes(q.question_type) && (q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                <div key={i} onClick={() => setAnswers({ ...answers, [q.id]: opt })} className={`choice-btn ${val === opt ? 'selected' : ''}`}>
                  {opt}
                </div>
              ))}

              {/* 4. CHECKBOXES */}
              {q.question_type === 'checkbox' && q.options.map((opt, i) => {
                const curr = val ? JSON.parse(val) : []
                const isChecked = curr.includes(opt)
                return (
                  <label key={i} className={`checkbox-label ${isChecked ? 'checked' : ''}`}>
                    <input type="checkbox" style={{display:'none'}} checked={isChecked} onChange={(e) => {
                      let newSel = [...curr]
                      e.target.checked ? newSel.push(opt) : newSel = newSel.filter(x => x !== opt)
                      setAnswers({ ...answers, [q.id]: JSON.stringify(newSel) })
                    }} />
                    <div className="check-box">{isChecked && '✓'}</div>
                    <span style={{ fontSize: '18px', fontWeight: '500' }}>{opt}</span>
                  </label>
                )
              })}

              {/* 5. DROPDOWN */}
              {q.question_type === 'dropdown' && (
                <select value={val || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                  <option value="" disabled>Select an option...</option>
                  {q.options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
              )}

              {/* 6. RATING / SLIDER */}
              {['rating', 'slider'].includes(q.question_type) && (
                <div className="range-wrapper">
                  <input 
                    type="range" min={q.range_min || 1} max={q.range_max || 10} step={1}
                    value={val || Math.ceil((q.range_max || 10)/2)} 
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                  <div className="range-value">{val || Math.ceil((q.range_max || 10)/2)}</div>
                </div>
              )}

              {/* 7. DATE */}
              {q.question_type === 'date' && (
                <input type="date" value={val || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              )}

              {/* 8. CONTACT INFO */}
              {q.question_type === 'contact_info' && (
                <div className="contact-grid">
                  {['Name', 'Email', 'Phone', 'Company'].map(f => (
                    <input key={f} type="text" placeholder={f} value={(val || {})[f] || ''} onChange={(e) => updateContact(f, e.target.value)} />
                  ))}
                </div>
              )}

              {/* 9. CONSENT */}
              {q.question_type === 'consent' && (
                <label className={`checkbox-label ${consentChecked ? 'checked' : ''}`}>
                  <input type="checkbox" style={{display:'none'}} checked={consentChecked} onChange={(e) => {
                    setConsentChecked(e.target.checked)
                    setAnswers({ ...answers, [q.id]: e.target.checked ? "Agreed" : "" })
                  }} />
                  <div className="check-box">{consentChecked && '✓'}</div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '18px' }}>I Agree</div>
                    <div style={{ color: '#64748B', fontSize: '14px' }}>I accept the terms and conditions.</div>
                  </div>
                </label>
              )}

            </div>
          </div>

          {/* NAV FOOTER */}
          <div className="footer">
            <button className={`btn-back ${index === 0 ? 'hidden' : ''}`} onClick={() => setIndex(index - 1)}>
              ← Back
            </button>
            <button className="btn-next" onClick={handleNext} disabled={q.question_type === 'consent' && !consentChecked}>
              {index < questions.length - 1 ? (q.button_text || 'Next') : 'Submit Securely'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}