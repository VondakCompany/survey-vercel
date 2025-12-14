import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import forge from 'node-forge'

// --- CONFIG ---
const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function FormPage() {
  const router = useRouter()
  const { id } = router.query
  
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [keys, setKeys] = useState({ q: null, p: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)

  // --- 1. SETUP ---
  useEffect(() => {
    if (!id) return
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const qKeyB64 = hashParams.get('q'); const pKeyB64 = hashParams.get('p')

    if (!qKeyB64 || !pKeyB64) {
      setError('MISSING KEYS: Use the secure link provided by the software.')
      setLoading(false); return
    }

    try {
      const qKey = forge.util.decode64(qKeyB64); const pKey = forge.util.decode64(pKeyB64)
      setKeys({ q: qKey, p: pKey })

      const fetchData = async () => {
        const { data, error } = await supabase.from('questions').select('*').eq('form_id', id).order('order')
        if (error) throw error
        setQuestions(data.map(r => ({
          ...r,
          question_text: decrypt(r.question_text, qKey),
          description: decrypt(r.description, qKey),
          options: decrypt(r.options, qKey) || []
        })))
        setLoading(false)
      }
      fetchData()
    } catch (e) { setError("Secure Link Invalid"); setLoading(false) }
  }, [id])

  const decrypt = (b64, key) => {
    if (!b64) return ""
    try {
      const raw = forge.util.decode64(b64)
      const d = forge.cipher.createDecipher('AES-GCM', key)
      d.start({ iv: raw.substring(0, 12), tag: raw.substring(12, 28) })
      d.update(forge.util.createBuffer(raw.substring(28)))
      return d.finish() ? JSON.parse(d.output.toString()) : ""
    } catch { return "" }
  }

  // --- 2. SUBMIT ---
  const handleSubmit = async () => {
    try {
      const sKey = forge.random.getBytesSync(32); const iv = forge.random.getBytesSync(12)
      const c = forge.cipher.createCipher('AES-GCM', sKey); c.start({ iv }); c.update(forge.util.createBuffer(JSON.stringify(answers))); c.finish()
      const pem = `-----BEGIN PUBLIC KEY-----\n${forge.util.encode64(keys.p).match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`
      const encKey = forge.pki.publicKeyFromPem(pem).encrypt(sKey, 'RSA-OAEP', { md: forge.md.sha256.create() })
      
      await supabase.from('responses').insert({ form_id: id, response: {
        key: forge.util.encode64(encKey), iv: forge.util.encode64(iv), tag: forge.util.encode64(c.mode.tag.getBytes()), data: forge.util.encode64(c.output.getBytes())
      }})
      alert('Response encrypted & submitted!'); setAnswers({}); setIndex(0)
    } catch (e) { alert('Error: ' + e.message) }
  }

  const handleNext = () => {
    const q = questions[index]
    if (q.required && !['title','info','consent'].includes(q.question_type) && (!answers[q.id] || answers[q.id].length===0)) return alert("Required")
    if (index < questions.length - 1) { setIndex(index + 1); setConsentChecked(false) } else handleSubmit()
  }

  const updateContact = (f, v) => setAnswers({...answers, [questions[index].id]: {...(answers[questions[index].id]||{}), [f]: v}})

  if (loading) return <div className="loading">Decrypting Secure Connection...</div>
  if (error) return <div className="error">{error}</div>
  if (!questions.length) return <div className="loading">No questions found.</div>

  const q = questions[index]
  const val = answers[q.id]

  return (
    <div className="page-container">
      {/* GLOBAL STYLES (NO TAILWIND REQUIRED) */}
      <style jsx global>{`
        body { margin: 0; background-color: #F8FAFC; color: #1E293B; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; }
        * { box-sizing: border-box; }
        
        .page-container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
        
        .progress-bar { width: 100%; height: 6px; background: #E2E8F0; position: fixed; top: 0; z-index: 50; }
        .progress-fill { height: 100%; background: #2563EB; transition: width 0.5s ease; }
        
        .content-wrapper { flex-grow: 1; width: 100%; display: flex; justify-content: center; align-items: center; padding: 40px 20px; }
        
        /* THE CARD */
        .card {
          background: #FFFFFF;
          width: 100%;
          max-width: 800px;
          min-height: 600px;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
          border: 1px solid #E2E8F0;
          padding: 60px;
          display: flex;
          flex-direction: column;
        }

        .badge-container { display: flex; justify-content: center; margin-bottom: 30px; }
        .secure-badge { 
          background: #DCFCE7; color: #15803D; font-size: 11px; font-weight: 800; 
          padding: 6px 14px; border-radius: 20px; letter-spacing: 1px; text-transform: uppercase; 
          border: 1px solid #BBF7D0; display: flex; align-items: center; gap: 6px;
        }

        .question-title { font-size: 32px; font-weight: 800; color: #0F172A; text-align: center; margin: 0 0 15px 0; line-height: 1.2; }
        .required-star { color: #DC2626; margin-left: 4px; }
        .description { font-size: 18px; color: #64748B; text-align: center; margin: 0 0 40px 0; line-height: 1.6; white-space: pre-wrap; }

        /* INPUTS */
        .input-group { width: 100%; display: flex; flex-direction: column; gap: 15px; }
        
        input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], select, textarea {
          width: 100%; padding: 16px; font-size: 18px; border: 2px solid #E2E8F0; border-radius: 8px;
          background: #FFFFFF; color: #334155; outline: none; transition: border-color 0.2s;
        }
        input:focus, textarea:focus, select:focus { border-color: #2563EB; }
        
        textarea { min-height: 150px; resize: none; }

        /* CHOICE BUTTONS */
        .choice-btn {
          width: 100%; text-align: left; padding: 18px 24px; border: 2px solid #E2E8F0;
          border-radius: 10px; background: #FFFFFF; font-size: 18px; font-weight: 500; color: #334155;
          cursor: pointer; transition: all 0.2s; display: flex; align-items: center;
        }
        .choice-btn:hover { background: #F1F5F9; border-color: #CBD5E1; }
        .choice-btn.selected { border-color: #2563EB; background: #EFF6FF; color: #1D4ED8; box-shadow: 0 2px 4px rgba(37,99,235,0.1); }
        .key-hint { 
          width: 32px; height: 32px; border: 1px solid #CBD5E1; border-radius: 6px; 
          display: flex; align-items: center; justify-content: center; margin-right: 15px;
          font-size: 14px; color: #94A3B8;
        }
        .choice-btn.selected .key-hint { border-color: #93C5FD; background: #FFFFFF; color: #2563EB; }

        /* CHECKBOX & CONSENT */
        .checkbox-label {
          display: flex; align-items: flex-start; padding: 18px; border: 2px solid #E2E8F0;
          border-radius: 10px; cursor: pointer; transition: all 0.2s;
        }
        .checkbox-label:hover { background: #F8FAFC; }
        .checkbox-label.checked { border-color: #2563EB; background: #EFF6FF; }
        
        .check-box {
          width: 24px; height: 24px; border: 2px solid #CBD5E1; border-radius: 6px; background: white;
          margin-right: 15px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .checkbox-label.checked .check-box { background: #2563EB; border-color: #2563EB; color: white; }

        /* FOOTER */
        .footer { margin-top: auto; padding-top: 40px; display: flex; justify-content: space-between; border-top: 1px solid #F1F5F9; }
        
        .btn-back { background: transparent; border: none; font-size: 16px; font-weight: 700; color: #94A3B8; cursor: pointer; }
        .btn-back:hover { color: #64748B; }
        .btn-back.hidden { visibility: hidden; }

        .btn-next { 
          background: #2563EB; color: white; padding: 14px 40px; border-radius: 8px; 
          font-size: 18px; font-weight: 700; border: none; cursor: pointer; 
          box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2); transition: transform 0.1s;
        }
        .btn-next:hover { background: #1D4ED8; }
        .btn-next:active { transform: scale(0.98); }
        .btn-next:disabled { background: #CBD5E1; cursor: not-allowed; box-shadow: none; }

        /* UTILS */
        .loading, .error { height: 100vh; display: flex; justify-content: center; align-items: center; font-size: 18px; color: #64748B; }
        .error { color: #DC2626; font-weight: bold; }
      `}</style>

      {/* PROGRESS */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="content-wrapper">
        <div className="card">
          
          {/* BADGE */}
          <div className="badge-container">
            <span className="secure-badge">🔒 End-to-End Encrypted</span>
          </div>

          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h1 className="question-title">
              {q.question_text}
              {q.required && <span className="required-star">*</span>}
            </h1>
            
            {q.description && <div className="description">{q.description}</div>}

            <div className="input-group">
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

              {q.question_type === 'long_text' && (
                <textarea 
                  placeholder="Type a detailed answer..."
                  autoFocus
                  value={val || ''} 
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} 
                />
              )}

              {['single_choice', 'yes_no'].includes(q.question_type) && (q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                <div key={i} onClick={() => setAnswers({ ...answers, [q.id]: opt })} className={`choice-btn ${val === opt ? 'selected' : ''}`}>
                  <div className="key-hint">{String.fromCharCode(65 + i)}</div>
                  {opt}
                </div>
              ))}

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

              {q.question_type === 'dropdown' && (
                <select value={val || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                  <option value="" disabled>Select an option...</option>
                  {q.options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
              )}

              {['rating', 'slider'].includes(q.question_type) && (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <input 
                    type="range" min={q.range_min || 1} max={q.range_max || 10} step={1}
                    value={val || Math.ceil((q.range_max || 10)/2)} 
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    style={{ width: '100%', marginBottom: '20px' }}
                  />
                  <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#2563EB' }}>
                    {val || Math.ceil((q.range_max || 10)/2)}
                  </div>
                </div>
              )}

              {q.question_type === 'date' && (
                <input type="date" value={val || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              )}

              {q.question_type === 'contact_info' && ['Name', 'Email', 'Phone', 'Company'].map(f => (
                <input key={f} type="text" placeholder={f} value={(val || {})[f] || ''} onChange={(e) => updateContact(f, e.target.value)} />
              ))}

              {q.question_type === 'consent' && (
                <label className={`checkbox-label ${consentChecked ? 'checked' : ''}`}>
                  <input type="checkbox" style={{display:'none'}} checked={consentChecked} onChange={(e) => {
                    setConsentChecked(e.target.checked)
                    setAnswers({ ...answers, [q.id]: e.target.checked ? "Agreed" : "" })
                  }} />
                  <div className="check-box">{consentChecked && '✓'}</div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '18px' }}>I Agree</div>
                    <div style={{ color: '#64748B' }}>I accept the terms and conditions.</div>
                  </div>
                </label>
              )}
            </div>
          </div>

          <div className="footer">
            <button className={`btn-back ${index === 0 ? 'hidden' : ''}`} onClick={() => setIndex(index - 1)}>← Back</button>
            <button className="btn-next" onClick={handleNext} disabled={q.question_type === 'consent' && !consentChecked}>
              {index < questions.length - 1 ? (q.button_text || 'Next') : 'Submit Securely'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}