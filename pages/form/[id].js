import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import forge from 'node-forge'

// CONFIG
const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function FormPage() {
  const router = useRouter()
  const { id } = router.query
  
  // STATE
  const [theme, setTheme] = useState({
      bg: "#F3F4F6", card: "#FFFFFF", text: "#000000", subtext: "#555555",
      accent: "#0445AF", accent_text: "#FFFFFF", border: "#E0E0E0",
      font_family: "Arial, sans-serif", radius: 8
  })
  const [questions, setQuestions] = useState([]) 
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [keys, setKeys] = useState({ q: null, p: null })
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)
  const inputRef = useRef(null)

  // CRYPTO & INIT
  const decrypt = (data, key) => {
      try {
          const raw = forge.util.decode64(data)
          const iv = raw.substring(0, 12)
          const tag = raw.substring(12, 28)
          const ct = raw.substring(28)
          const d = forge.cipher.createDecipher('AES-GCM', key)
          d.start({ iv: iv, tag: forge.util.createBuffer(tag) }); d.update(forge.util.createBuffer(ct)); d.finish()
          return JSON.parse(d.output.toString())
      } catch { return null }
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

  useEffect(() => {
    if (!id) return
    (async () => {
        try {
            // 1. Get Theme
            const { data: formData } = await supabase.from('forms').select('theme_config').eq('id', id).single()
            if (formData?.theme_config) setTheme(formData.theme_config)

            // 2. Get Keys & Questions
            const { data: kData } = await supabase.from('survey_keys').select('*').eq('form_id', id).single()
            if (!kData) throw new Error("Survey not found")
            
            const k = forge.util.decode64(kData.q_key)
            setKeys({ q: k, p: kData.p_key })

            const { data: qData } = await supabase.from('questions').select('*').eq('form_id', id).order('order')
            
            if (qData) {
                setQuestions(qData.map(r => ({
                    ...r,
                    question_text: decrypt(r.question_text, k),
                    description: decrypt(r.description, k),
                    options: decrypt(r.options, k) || [],
                    included_fields: decrypt(r.included_fields, k) || [],
                    checkbox_label: r.checkbox_label || "I accept"
                })))
            }
            setLoading(false)
        } catch (e) {
            console.error(e)
            setError(e.message)
            setLoading(false)
        }
    })()
  }, [id])

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
  }, [index])

  // ACTIONS
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

  const next = () => {
      const q = questions[index]
      const val = answers[q.id]
      
      if (q.required && !val && !['title','info'].includes(q.question_type)) {
          alert("Required")
          return
      }
      if (q.question_type === 'consent' && !consentChecked) {
          alert("Must accept terms")
          return
      }

      if (index < questions.length - 1) {
          setIndex(index + 1)
          setConsentChecked(false)
      } else {
          handleSubmit()
      }
  }

  const updateContact = (field, val) => {
      const qId = questions[index].id
      const current = answers[qId] || {}
      setAnswers({ ...answers, [qId]: { ...current, [field]: val } })
  }

  if (loading) return <div style={{display:'flex', height:'100vh', justifyContent:'center', alignItems:'center'}}>Loading...</div>
  if (error) return <div style={{color:'red'}}>Error: {error}</div>
  if (!questions.length) return <div>Error loading form</div>

  const q = questions[index]
  const val = answers[q.id] || ""
  const isCentered = ['title', 'info'].includes(q.question_type)
  const isTitle = q.question_type === 'title'

  return (
    <div className="container">
      {/* DYNAMIC THEME INJECTION */}
      <style jsx global>{`
        body { margin: 0; background-color: ${theme.bg}; color: ${theme.text}; font-family: ${theme.font_family}; }
        .container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; box-sizing:border-box; }
        
        .card {
          background: ${theme.card}; width: 100%; max-width: 800px; min-height: 500px;
          border-radius: ${theme.radius}px; 
          border: 1px solid ${theme.border};
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          padding: 60px; display: flex; flex-direction: column; position: relative;
        }
        
        .btn {
            background: ${theme.accent}; color: ${theme.accent_text}; 
            padding: 12px 32px; border-radius: ${theme.radius}px; border: none; 
            font-weight: bold; cursor: pointer; font-size: 18px; margin-top: 20px; transition: opacity 0.2s;
        }
        .btn:hover { opacity: 0.9; }
        
        .input {
            width: 100%; border: none; border-bottom: 1px solid ${theme.border};
            background: transparent; padding: 10px 0; font-size: 24px; color: ${theme.text}; outline: none;
        }
        .input:focus { border-bottom: 2px solid ${theme.accent}; }
        
        .choice-item {
          padding: 15px; border: 1px solid ${theme.border}; border-radius: ${theme.radius}px;
          margin-bottom: 10px; cursor: pointer; display: flex; align-items: center; font-size: 16px; 
          background: ${theme.bg}; color: ${theme.text}; transition: all 0.1s;
        }
        .choice-item:hover, .choice-item.selected { 
            border-color: ${theme.accent}; background: ${theme.card}; color: ${theme.accent}; box-shadow: 0 0 0 1px ${theme.accent};
        }

        .slider-container { width: 100%; padding: 30px 0; text-align: center; }
        .range-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; background: ${theme.border}; outline: none; }
        .range-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 28px; border-radius: 50%; background: ${theme.card}; border: 2px solid ${theme.accent}; cursor: pointer; }

        .contact-grid { display: grid; grid-template-columns: 1fr; gap: 15px; margin-top: 20px; }
        @media(min-width:600px) { .contact-grid { grid-template-columns: 1fr 1fr; } }
        .contact-field input { 
            width: 100%; padding: 12px; border: 1px solid ${theme.border}; border-radius: ${theme.radius}px; 
            background: ${theme.bg}; color: ${theme.text}; box-sizing: border-box; font-size:16px;
        }
        
        .subtext { color: ${theme.subtext}; font-size: 18px; margin-bottom: 30px; text-align: ${isCentered ? 'center':'left'}; }
        h1 { margin: 0 0 10px 0; font-size: ${isTitle ? '36px' : '32px'}; text-align: ${isCentered ? 'center':'left'}; font-weight: ${isTitle ? 'bold' : '500'}; }
      `}</style>

      <div className="card">
        <h1>{q.question_text}</h1>
        {q.description && <div className="subtext">{q.description}</div>}

        <div style={{flexGrow: 1, width:'100%'}}>
            {['text', 'email', 'number', 'phone'].includes(q.question_type) && (
                <input ref={inputRef} className="input" placeholder="Type here..." value={val} 
                    type={q.question_type === 'number' ? 'number' : 'text'}
                    onChange={e => setAnswers({...answers, [q.id]: e.target.value})} 
                    onKeyDown={e => e.key === 'Enter' && next()}
                />
            )}
            
            {q.question_type === 'long_text' && (
                <textarea className="input" style={{border:`1px solid ${theme.border}`, minHeight:120, padding:15, borderRadius: theme.radius}}
                    placeholder="Type here..." value={val} 
                    onChange={e => setAnswers({...answers, [q.id]: e.target.value})} 
                />
            )}

            {['single_choice', 'yes_no'].includes(q.question_type) && (
                <div>
                    {(q.question_type === 'yes_no' ? ['Yes','No'] : q.options).map((opt, i) => (
                        <div key={i} className={`choice-item ${val === opt ? 'selected' : ''}`} 
                             onClick={() => { setAnswers({...answers, [q.id]: opt}); setTimeout(next, 150); }}>
                            <span style={{fontWeight:'bold', marginRight:10}}>{String.fromCharCode(65+i)}</span> {opt}
                        </div>
                    ))}
                </div>
            )}

            {q.question_type === 'rating' && (
                <div style={{display:'flex', justifyContent:'center', fontSize:40, cursor:'pointer'}}>
                    {[...Array(q.range_max || 5)].map((_, i) => (
                        <span key={i} style={{color: (i+1) <= val ? '#F59E0B' : theme.border, margin:'0 5px'}}
                              onClick={() => { setAnswers({...answers, [q.id]: i+1}); setTimeout(next, 300); }}>★</span>
                    ))}
                </div>
            )}

            {q.question_type === 'slider' && (
               <div className="slider-container">
                 <div style={{fontSize: 48, fontWeight: 700, color: theme.accent, marginBottom: 20}}>
                    {val || Math.ceil((q.range_max||10)/2)}
                 </div>
                 <div style={{display:'flex', alignItems:'center', gap: 15}}>
                    <span style={{fontWeight:'bold', color: theme.subtext}}>{q.range_min || 1}</span>
                    <input type="range" className="range-slider"
                        min={q.range_min || 1} max={q.range_max || 10} 
                        value={val || Math.ceil((q.range_max||10)/2)}
                        onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                    />
                    <span style={{fontWeight:'bold', color: theme.subtext}}>{q.range_max || 10}</span>
                 </div>
               </div>
            )}

            {q.question_type === 'contact_info' && (
                <div className="contact-grid">
                   {['First Name', 'Last Name', 'Email', 'Phone', 'Company'].filter(f => (q.included_fields||['First Name', 'Email']).includes(f)).map(f => (
                     <div key={f} className="contact-field">
                        <label style={{display:'block', marginBottom:5, fontSize:12, fontWeight:'bold', color:theme.subtext}}>{f}</label>
                        <input type={f === 'Email' ? 'email' : 'text'} 
                           value={(val || {})[f] || ''} 
                           onChange={e => updateContact(f, e.target.value)} 
                        />
                     </div>
                   ))}
                </div>
            )}

            {q.question_type === 'consent' && (
                <label style={{display:'flex', alignItems:'center', cursor:'pointer', padding: 15, border: `1px solid ${theme.border}`, borderRadius: theme.radius}}>
                    <input type="checkbox" style={{width: 20, height: 20, marginRight: 15}} 
                        checked={consentChecked} onChange={e => {setConsentChecked(e.target.checked); setAnswers({...answers, [q.id]: e.target.checked})}} 
                    />
                    <span style={{fontWeight: 600}}>{q.checkbox_label}</span>
                </label>
            )}
        </div>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 30}}>
            {index > 0 ? <button style={{background:'none', border:'none', cursor:'pointer', color: theme.subtext}} onClick={() => setIndex(index-1)}>Back</button> : <div/>}
            <button className="btn" onClick={next}>
                {index === questions.length - 1 ? "Submit" : (q.button_text || "Continue")}
            </button>
        </div>
      </div>
    </div>
  )
}
