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
  // CRYPTO HELPERS
  // ----------------------------------------------------------------
  const decryptAES = (b64Cipher, key) => {
    if (!b64Cipher) return ""
    try {
      // safe decode
      const raw = forge.util.decode64(b64Cipher)
      
      // Extract IV (12 bytes), Tag (16 bytes), Ciphertext (Rest)
      const iv = raw.substring(0, 12)
      const tag = raw.substring(12, 28)
      const ct = raw.substring(28)

      const decipher = forge.cipher.createDecipher('AES-GCM', key)
      decipher.start({ iv: iv, tag: forge.util.createBuffer(tag) })
      decipher.update(forge.util.createBuffer(ct))
      
      const pass = decipher.finish()
      if (!pass) {
          console.error("Decryption Integrity Check Failed")
          return ""
      }
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
        console.error("Encryption Error:", e)
        throw e
    }
  }

  // ----------------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!id) return

    const initializeForm = async () => {
      console.log("Initializing Form ID:", id)
      try {
        // 1. Fetch Keys
        const { data: keyData, error: keyError } = await supabase
          .from('survey_keys').select('*').eq('form_id', id).single()
        
        if (keyError) {
            console.error("Key Fetch Error:", keyError)
            throw new Error("Could not fetch survey encryption keys.")
        }
        if (!keyData) throw new Error("Survey not found.")

        // Decode Question Key
        const qKey = forge.util.decode64(keyData.q_key)
        setKeys({ q: qKey, p: keyData.p_key })
        console.log("Keys loaded successfully.")

        // 2. Fetch Questions
        const { data: qData, error: qError } = await supabase
          .from('questions').select('*').eq('form_id', id).order('order')
        
        if (qError) {
            console.error("Question Fetch Error:", qError)
            throw qError
        }
        
        console.log(`Fetched ${qData.length} encrypted questions. Decrypting...`)

        // 3. Decrypt Questions
        const decrypted = qData.map((row, i) => {
          try {
              return {
                ...row,
                question_text: decryptAES(row.question_text, qKey),
                description: decryptAES(row.description, qKey),
                options: decryptAES(row.options, qKey) || [],
                // Safety check for older rows that might lack this column
                checkbox_label: row.checkbox_label || "I accept the terms and conditions"
              }
          } catch (err) {
              console.error(`Failed to decrypt row ${i}:`, err)
              return null
          }
        }).filter(q => q !== null) // Remove failed decryptions

        setQuestions(decrypted)
        setLoading(false)

      } catch (e) {
        console.error("Critical Init Error:", e)
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
    
    // Logic Validation
    if (['title', 'info'].includes(q.question_type)) { goStep(1); return }
    if (q.question_type === 'consent' && !consentChecked) { alert("Please check the box to continue."); return }
    if (q.required) {
        if (!val || (typeof val === 'string' && !val.trim())) { alert("Required field"); return }
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
    // Auto-advance for single choice
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
  if (loading) return (
      <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center', flexDirection:'column', fontFamily:'sans-serif', color:'#555'}}>
          <div style={{marginBottom: 20}}>Loading Secure Survey...</div>
      </div>
  )

  if (error) return (
      <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center', color:'red', fontFamily:'sans-serif'}}>
          Error: {error}
      </div>
  )

  if (!questions.length) return <div>No questions found.</div>
  
  const q = questions[index]
  const val = answers[q.id]
  const isCentered = ['title', 'info'].includes(q.question_type)
  const isTitle = q.question_type === 'title'

  // Input types that have their own "Next" flow (inline buttons or auto-advance)
  const hasInlineNext = ['text', 'email', 'phone', 'number', 'single_choice', 'yes_no'].includes(q.question_type)
  const isLastSlide = index === questions.length - 1

  // Helper for Stars
  const renderStars = (max, current) => {
    const stars = []
    for (let i = 1; i <= max; i++) {
      const fill = i <= (current || 0) ? "#F59E0B" : "none" // Amber or transparent
      const stroke = i <= (current || 0) ? "#F59E0B" : "#D1D5DB" // Amber or Gray
      stars.push(
        <svg key={i} width="40" height="40" viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ cursor: 'pointer', margin: '0 5px', transition: 'transform 0.1s' }}
          onClick={() => {
              setAnswers({...answers, [q.id]: i});
              setTimeout(() => handleNext(), 300); // Optional auto-advance
          }}
          onMouseEnter={(e) => e.target.style.transform = "scale(1.2)"}
          onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      )
    }
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>{stars}</div>
  }

  return (
    <div className="container">
      <style jsx global>{`
        body { margin: 0; background-color: ${THEME.bg}; color: ${THEME.text}; font-family: ${THEME.font}; }
        .container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; }
        .progress-bar { position: fixed; top: 0; left: 0; height: 4px; background: ${THEME.accent}; transition: width 0.3s; z-index: 99; }
        .card {
          background: ${THEME.cardBg}; width: 100%; max-width: 800px; min-height: 500px;
          border-radius: 12px; box-shadow: ${THEME.shadow}; border: 1px solid ${THEME.border};
          padding: 60px; display: flex; flex-direction: column; position: relative;
        }
        .question-title { 
          font-size: ${isTitle ? '36px' : (isCentered ? '30px' : '24px')}; 
          font-weight: ${isTitle ? '800' : '600'};
          text-align: ${isCentered ? 'center' : 'left'}; margin: 0 0 10px 0; color: #111;
        }
        .description { 
          font-size: 16px; font-weight: 400; text-align: ${isCentered ? 'center' : 'left'};
          color: ${THEME.subtext}; margin-bottom: 30px; line-height: 1.5;
        }
        
        /* INPUT STYLES */
        .tf-input {
          width: 100%; font-size: 24px; color: #000; border: none; border-bottom: 1px solid ${THEME.border}; 
          background: transparent; padding: 10px 0; outline: none; transition: border-color 0.2s;
        }
        .tf-input:focus { border-bottom: 2px solid ${THEME.highlight}; }
        
        /* CONTACT GRID */
        .contact-grid { display: grid; grid-template-columns: 1fr; gap: 20px; width: 100%; }
        @media (min-width: 600px) {
            .contact-grid.has-names { grid-template-columns: 1fr 1fr; }
            .contact-full { grid-column: 1 / -1; }
        }
        .contact-field label { display: block; font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 6px; }
        .contact-field input { 
            width: 100%; box-sizing: border-box; border: 1px solid #D1D5DB; border-radius: 6px; 
            padding: 12px; font-size: 16px; background: #F9FAFB; transition: all 0.2s;
        }
        .contact-field input:focus { background: #FFF; border-color: ${THEME.highlight}; outline: none; box-shadow: 0 0 0 3px rgba(4, 69, 175, 0.1); }

        /* SLIDER CUSTOM */
        .slider-container { width: 100%; padding: 20px 0; text-align: center; }
        .range-slider {
            -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; background: #E5E7EB; outline: none;
        }
        .range-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none; width: 28px; height: 28px; border-radius: 50%; 
            background: #FFFFFF; border: 2px solid ${THEME.highlight}; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .range-slider::-moz-range-thumb {
            width: 28px; height: 28px; border-radius: 50%; background: #FFFFFF; border: 2px solid ${THEME.highlight}; cursor: pointer;
        }

        /* BUTTONS */
        .btn-action {
          background-color: ${THEME.accent}; color: white; font-size: 18px; font-weight: 600;
          padding: 12px 32px; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; margin-top: 20px;
        }
        .btn-action:hover { opacity: 0.9; transform: translateY(-1px); }
        .choice-item {
          padding: 15px; border: 1px solid ${THEME.border}; border-radius: 8px;
          margin-bottom: 10px; cursor: pointer; display: flex; align-items: center; font-size: 16px; transition: all 0.1s; background: white;
        }
        .choice-item:hover { border-color: ${THEME.highlight}; background: #F0F9FF; color: ${THEME.highlight}; }
        .choice-item.selected { background-color: #F0F9FF; border-color: ${THEME.highlight}; color: ${THEME.highlight}; font-weight: 700; box-shadow: 0 0 0 1px ${THEME.highlight}; }
        .key-badge { 
          width: 28px; height: 28px; border: 1px solid #DDD; color: #555; border-radius: 4px; 
          display: flex; align-items: center; justify-content: center; margin-right: 15px; font-size: 12px; font-weight: 700;
        }
        .choice-item.selected .key-badge { background: ${THEME.highlight}; color: white; border: none; }
        
        .footer { margin-top: auto; padding-top: 20px; display: flex; justify-content: space-between; align-items: center; width: 100%; }
      `}</style>

      <div className="progress-bar" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />

      <div className="card">
        <div style={{ flexGrow: 1 }}>
          <h1 className="question-title">{q.question_text}{q.required && <span style={{color:'red'}}>*</span>}</h1>
          {q.description && <div className="description">{q.description}</div>}

          <div style={{ width: '100%', marginTop: 20 }}>
            
            {/* TEXT / EMAIL / PHONE / NUMBER */}
            {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
               <div style={{display:'flex'}}>
                 <input ref={inputRef} className="tf-input"
                   type={q.question_type === 'number' ? 'number' : 'text'}
                   placeholder="Type your answer here..."
                   value={val || ''}
                   onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                   onKeyDown={e => e.key === 'Enter' && handleNext()}
                 />
                 <button className="btn-action" style={{marginLeft:15, marginTop:0}} onClick={handleNext}>OK</button>
               </div>
            )}

            {/* LONG TEXT */}
            {q.question_type === 'long_text' && (
              <textarea ref={inputRef} className="tf-input" placeholder="Type..." value={val || ''}
                onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                style={{minHeight: 120, resize:'none', border: `1px solid ${THEME.border}`, borderRadius: 6, padding: 15}}
              />
            )}

            {/* CHOICES */}
            {['single_choice', 'yes_no'].includes(q.question_type) && (
              <div>
                {(q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                  <div key={i} className={`choice-item ${val === opt ? 'selected' : ''}`} onClick={() => handleChoice(opt)}>
                    <div className="key-badge">{String.fromCharCode(65 + i)}</div> {opt}
                  </div>
                ))}
              </div>
            )}

            {/* RATING STARS (PROFESSIONAL) */}
            {q.question_type === 'rating' && renderStars(parseInt(q.range_max || 5), parseInt(val))}

            {/* SLIDER (PROFESSIONAL) */}
            {q.question_type === 'slider' && (
               <div className="slider-container">
                 <div style={{fontSize: 48, fontWeight: 700, color: THEME.highlight, marginBottom: 20}}>
                    {val || Math.ceil((q.range_max||10)/2)}
                 </div>
                 <div style={{display:'flex', alignItems:'center', gap: 15}}>
                    <span style={{fontWeight:'bold', color: '#999'}}>{q.range_min || 1}</span>
                    <input type="range" className="range-slider"
                        min={q.range_min || 1} max={q.range_max || 10} 
                        value={val || Math.ceil((q.range_max||10)/2)}
                        onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                    />
                    <span style={{fontWeight:'bold', color: '#999'}}>{q.range_max || 10}</span>
                 </div>
               </div>
            )}

            {/* CONTACT INFO (GRID LAYOUT) */}
            {q.question_type === 'contact_info' && (
                <div className={`contact-grid ${['First Name', 'Last Name'].every(f => (q.included_fields||[]).includes(f)) ? 'has-names' : ''}`}>
                   {['First Name', 'Last Name', 'Email', 'Phone', 'Company'].filter(f => (q.included_fields||['First Name', 'Email']).includes(f)).map(f => (
                     <div key={f} className={`contact-field ${['Email', 'Phone', 'Company'].includes(f) ? 'contact-full' : ''}`}>
                        <label>{f}</label>
                        <input type={f === 'Email' ? 'email' : 'text'} 
                           placeholder="..."
                           value={(val || {})[f] || ''} 
                           onChange={e => updateContact(f, e.target.value)} 
                        />
                     </div>
                   ))}
                </div>
            )}

            {/* CONSENT (Simplification) */}
            {q.question_type === 'consent' && (
                <label style={{display:'flex', alignItems:'center', cursor:'pointer', padding: 15, border: `1px solid ${THEME.border}`, borderRadius: 6}}>
                    <input type="checkbox" style={{width: 20, height: 20, marginRight: 15}} 
                        checked={consentChecked} onChange={e => {setConsentChecked(e.target.checked); setAnswers({...answers, [q.id]: e.target.checked})}} 
                    />
                    <span style={{fontWeight: 600}}>{q.checkbox_label}</span>
                </label>
            )}

          </div>
        </div>

        {/* FOOTER */}
        <div className="footer">
          {index > 0 ? <button style={{background:'none', border:'none', cursor:'pointer', color:'#999'}} onClick={() => goStep(-1)}>Back</button> : <div></div>}
          {(!hasInlineNext || isLastSlide || q.question_type === 'contact_info' || q.question_type === 'slider' || q.question_type === 'rating') && (
            <button className="btn-action" onClick={handleNext}>
              {isLastSlide ? 'Submit' : (q.button_text || 'Continue')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
