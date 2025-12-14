import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import forge from 'node-forge'

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function FormPage() {
  const router = useRouter()
  const { id } = router.query
  
  // --- STATE ---
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [keys, setKeys] = useState({ q: null, p: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)

  // --- 1. INITIALIZATION & DECRYPTION ---
  useEffect(() => {
    if (!id) return

    // 1. Get Keys from URL Hash (Client-side Security)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const qKeyB64 = hashParams.get('q')
    const pKeyB64 = hashParams.get('p')

    if (!qKeyB64 || !pKeyB64) {
      setError('MISSING KEYS: This is a secure form. Please use the full link provided by the software.')
      setLoading(false)
      return
    }

    try {
      // 2. Decode Keys
      const qKey = forge.util.decode64(qKeyB64)
      const pKey = forge.util.decode64(pKeyB64)
      setKeys({ q: qKey, p: pKey })

      // 3. Fetch & Decrypt Data
      const fetchData = async () => {
        const { data: rawData, error: dbError } = await supabase
          .from('questions')
          .select('*')
          .eq('form_id', id)
          .order('order')

        if (dbError) throw dbError

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
      setError("Secure Link Corrupted or Invalid.")
      setLoading(false)
    }
  }, [id])

  // --- CRYPTO HELPERS ---
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

  // --- 2. SUBMISSION (ENCRYPTION) ---
  const handleSubmit = async () => {
    try {
      // A. Prepare Payload
      const payload = JSON.stringify(answers)

      // B. Generate Session Key
      const sessionKey = forge.random.getBytesSync(32)
      const iv = forge.random.getBytesSync(12)

      // C. Encrypt Payload (AES-GCM)
      const cipher = forge.cipher.createCipher('AES-GCM', sessionKey)
      cipher.start({ iv: iv })
      cipher.update(forge.util.createBuffer(payload))
      cipher.finish()
      const encryptedData = cipher.output.getBytes()
      const tag = cipher.mode.tag.getBytes()

      // D. Encrypt Session Key (RSA-OAEP)
      const pem = `-----BEGIN PUBLIC KEY-----\n${forge.util.encode64(keys.p).match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`
      const publicKey = forge.pki.publicKeyFromPem(pem)
      const encryptedSessionKey = publicKey.encrypt(sessionKey, 'RSA-OAEP', { md: forge.md.sha256.create() })

      // E. Upload Envelope
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
      setIndex(0) // Reset form or redirect
      
    } catch (e) {
      alert('Encryption Error: ' + e.message)
    }
  }

  // --- 3. LOGIC & VALIDATION ---
  const handleNext = () => {
    const q = questions[index]
    const val = answers[q.id]
    
    // Validation Logic
    if (q.required && !['title','info'].includes(q.question_type)) {
      if (q.question_type === 'consent' && !consentChecked) {
        alert("You must agree to continue.")
        return
      }
      if (q.question_type === 'contact_info') {
        // Require at least Name and Email for contact blocks
        if (!val || !val['Name'] || !val['Email']) {
          alert('Please fill in at least Name and Email.')
          return
        }
      }
      // General check for empty values
      if (!val || (Array.isArray(val) && val.length === 0) || (typeof val === 'string' && val.trim() === '')) { 
        alert('This question is required.')
        return 
      }
    }

    if (index < questions.length - 1) {
      setIndex(index + 1)
      setConsentChecked(false) // Reset consent for next slide if applicable
    } else {
      handleSubmit()
    }
  }

  const updateContact = (field, text) => {
    const current = answers[questions[index].id] || {}
    setAnswers({ ...answers, [questions[index].id]: { ...current, [field]: text } })
  }

  // --- 4. RENDER ---
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500 font-medium">Initializing Secure Connection...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold p-10 bg-red-50">{error}</div>
  if (questions.length === 0) return <div className="min-h-screen flex items-center justify-center text-slate-400">No questions found.</div>

  const q = questions[index]
  const val = answers[q.id]

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col items-center">
      
      {/* PROGRESS BAR */}
      <div className="w-full h-2 bg-slate-200 fixed top-0 z-50">
        <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="w-full flex-grow flex flex-col justify-center items-center py-12 px-4">
        
        {/* MAIN CARD: Fixed 800px Width, Shadowed, Rounded */}
        <div className="w-full max-w-[800px] bg-white rounded-2xl shadow-xl border border-slate-200 p-10 md:p-16 flex flex-col relative">
          
          {/* SECURE BADGE */}
          <div className="flex justify-center mb-8">
            <div className="bg-green-50 text-green-700 text-xs font-bold px-4 py-1.5 rounded-full border border-green-200 uppercase tracking-widest flex items-center gap-2">
              <span className="text-lg">🔒</span> End-to-End Encrypted
            </div>
          </div>

          <div className="flex-grow flex flex-col justify-center w-full">
            
            {/* QUESTION HEADER */}
            <h1 className="text-3xl md:text-4xl font-extrabold mb-4 text-center leading-tight text-slate-900">
              {q.question_text}
              {q.required && <span className="text-red-500 ml-1" title="Required">*</span>}
            </h1>

            {q.description && (
              <p className="text-lg text-slate-500 mb-10 text-center whitespace-pre-wrap leading-relaxed max-w-2xl mx-auto">
                {q.description}
              </p>
            )}

            {/* INPUTS AREA */}
            <div className="w-full space-y-6">
              
              {/* 1. SIMPLE INPUTS */}
              {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
                <input 
                  type={q.question_type === 'number' ? 'number' : 'text'} 
                  className="w-full p-5 text-xl border-2 border-slate-200 rounded-xl focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder-slate-300" 
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
                  className="w-full p-5 text-xl border-2 border-slate-200 rounded-xl focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none transition-all min-h-[180px] resize-none" 
                  placeholder="Type your detailed answer here..."
                  autoFocus
                  value={val || ''} 
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} 
                />
              )}

              {/* 3. CHOICES (Radio) */}
              {['single_choice', 'yes_no'].includes(q.question_type) && (
                <div className="grid gap-3">
                  {(q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                    <button 
                      key={i} 
                      onClick={() => setAnswers({ ...answers, [q.id]: opt })} 
                      className={`w-full text-left p-5 rounded-xl border-2 text-lg font-semibold transition-all transform active:scale-[0.99] flex items-center ${
                        val === opt 
                          ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200' 
                          : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className={`mr-4 w-8 h-8 flex-shrink-0 flex items-center justify-center border rounded-md text-sm ${val===opt ? 'border-blue-400 bg-white text-blue-600' : 'border-slate-300 text-slate-400'}`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* 4. CHECKBOXES */}
              {q.question_type === 'checkbox' && (
                 <div className="grid gap-3">
                   {q.options.map((opt, i) => {
                     const curr = val ? JSON.parse(val) : []
                     const checked = curr.includes(opt)
                     return (
                       <label key={i} className={`flex items-center w-full p-5 rounded-xl border-2 cursor-pointer transition-all ${checked ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300'}`}>
                         <div className={`w-6 h-6 mr-4 border-2 rounded flex-shrink-0 flex items-center justify-center transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                           {checked && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                         </div>
                         <input type="checkbox" className="hidden" checked={checked} 
                            onChange={(e) => { 
                              let newSel = [...curr]
                              if (e.target.checked) newSel.push(opt)
                              else newSel = newSel.filter(x => x !== opt)
                              setAnswers({ ...answers, [q.id]: JSON.stringify(newSel) }) 
                            }} 
                          />
                         <span className={`text-lg font-semibold ${checked ? 'text-blue-700' : 'text-slate-700'}`}>{opt}</span>
                       </label>
                     )
                   })}
                 </div>
              )}

              {/* 5. DROPDOWN */}
              {q.question_type === 'dropdown' && (
                <div className="relative">
                  <select 
                    className="w-full p-5 text-xl border-2 border-slate-200 rounded-xl bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none appearance-none cursor-pointer text-slate-700 font-medium"
                    value={val || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  >
                    <option value="" disabled>Select an option...</option>
                    {q.options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-6 pointer-events-none text-slate-500">▼</div>
                </div>
              )}

              {/* 6. SLIDER / RATING */}
              {['rating', 'slider'].includes(q.question_type) && (
                <div className="pt-8 pb-4 px-2">
                  <div className="relative mb-8">
                    <input 
                      type="range" 
                      min={q.range_min || 1} 
                      max={q.range_max || 10} 
                      step={1}
                      value={val || Math.ceil((q.range_max || 10)/2)} 
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-700"
                    />
                    <div className="flex justify-between mt-4 text-slate-400 font-bold uppercase tracking-wider text-xs">
                      <span>Low ({q.range_min || 1})</span>
                      <span>High ({q.range_max || 10})</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <span className="text-5xl font-bold text-blue-600 border-4 border-blue-100 rounded-full w-24 h-24 flex items-center justify-center mx-auto shadow-sm">
                      {val || Math.ceil((q.range_max || 10)/2)}
                    </span>
                  </div>
                </div>
              )}

              {/* 7. DATE PICKER */}
              {q.question_type === 'date' && (
                <div className="flex justify-center">
                  <input 
                    type="date" 
                    className="w-full max-w-sm p-5 text-xl border-2 border-slate-200 rounded-xl focus:border-blue-600 outline-none text-center text-slate-700 bg-white font-mono"
                    value={val || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                </div>
              )}

              {/* 8. CONTACT INFO BLOCK */}
              {q.question_type === 'contact_info' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {['Name', 'Email', 'Phone', 'Company'].map((field) => (
                    <div key={field}>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">{field}</label>
                      <input 
                        type={field === 'Email' ? 'email' : (field === 'Phone' ? 'tel' : 'text')}
                        className="w-full p-4 text-lg border-2 border-slate-200 rounded-xl focus:border-blue-600 outline-none transition-colors"
                        placeholder={`Enter ${field}...`}
                        value={(val || {})[field] || ''}
                        onChange={(e) => updateContact(field, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* 9. CONSENT */}
              {q.question_type === 'consent' && (
                 <label className={`flex items-start p-6 border-2 rounded-xl cursor-pointer transition-all ${consentChecked ? 'border-green-500 bg-green-50 ring-2 ring-green-100' : 'border-slate-300 hover:border-slate-400 bg-white'}`}>
                   <div className={`mt-1 w-6 h-6 mr-4 border-2 rounded flex-shrink-0 flex items-center justify-center transition-colors ${consentChecked ? 'bg-green-600 border-green-600' : 'border-slate-300 bg-white'}`}>
                      {consentChecked && <span className="text-white font-bold text-sm">✓</span>}
                   </div>
                   <input type="checkbox" className="hidden" checked={consentChecked} 
                      onChange={(e) => {
                        setConsentChecked(e.target.checked)
                        setAnswers({ ...answers, [q.id]: e.target.checked ? "Agreed" : "" })
                      }} 
                    />
                   <div className="flex-1">
                     <span className="text-lg font-bold text-slate-900 block mb-1">I Agree</span>
                     <span className="text-slate-500 text-sm">I acknowledge that I have read and accept the terms presented above.</span>
                   </div>
                 </label>
              )}

            </div>
          </div>

          {/* FOOTER NAV */}
          <div className="flex justify-between items-center mt-12 pt-8 border-t border-slate-100">
             <button 
                onClick={() => index > 0 && setIndex(index-1)} 
                className={`text-slate-400 hover:text-slate-600 font-bold px-5 py-3 text-lg transition-colors flex items-center gap-2 ${index === 0 ? 'invisible' : ''}`}
             >
               ← Back
             </button>
             
             <button 
                onClick={handleNext} 
                disabled={q.question_type === 'consent' && !consentChecked}
                className={`text-white text-lg font-bold py-3 px-10 rounded-xl shadow-lg transition-all transform active:scale-[0.98] flex items-center gap-3 ${
                  q.question_type === 'consent' && !consentChecked 
                    ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                    : 'bg-blue-600 hover:bg-blue-700 hover:shadow-xl hover:-translate-y-1'
                }`}
              >
                {index < questions.length - 1 ? (q.button_text || 'Next') : 'Submit Securely'}
                {index < questions.length - 1 && <span>→</span>}
             </button>
          </div>

        </div>
      </div>
    </div>
  )
}