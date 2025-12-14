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
  
  // State
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

    // Extract Keys from URL Hash (Client-side only)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const qKeyB64 = hashParams.get('q') // AES Key for Questions
    const pKeyB64 = hashParams.get('p') // RSA Public Key for Answers

    if (!qKeyB64 || !pKeyB64) {
      setError('MISSING KEYS: Please use the secure link provided by the software.')
      setLoading(false)
      return
    }

    try {
      // Decode Keys
      const qKey = forge.util.decode64(qKeyB64)
      const pKey = forge.util.decode64(pKeyB64)
      setKeys({ q: qKey, p: pKey })

      // Fetch Encrypted Data
      const fetchData = async () => {
        const { data: rawData, error: dbError } = await supabase
          .from('questions')
          .select('*')
          .eq('form_id', id)
          .order('order')

        if (dbError) throw dbError

        // Decrypt Logic (AES-GCM)
        const decrypted = rawData.map(row => {
          const decryptField = (b64Cipher) => {
            if (!b64Cipher) return ""
            try {
              // Python sends: IV(12) + TAG(16) + CIPHERTEXT
              const raw = forge.util.decode64(b64Cipher)
              const iv = raw.substring(0, 12)
              const tag = raw.substring(12, 28)
              const ciphertext = raw.substring(28)

              const decipher = forge.cipher.createDecipher('AES-GCM', qKey)
              decipher.start({ iv: iv, tag: tag })
              decipher.update(forge.util.createBuffer(ciphertext))
              if (decipher.finish()) return JSON.parse(decipher.output.toString())
              return "[Decryption Failed]"
            } catch (e) { return "" }
          }

          return {
            ...row,
            question_text: decryptField(row.question_text),
            description: decryptField(row.description),
            options: decryptField(row.options) || []
          }
        })
        setQuestions(decrypted)
        setLoading(false)
      }
      fetchData()
    } catch (e) {
      setError("Secure Link Corrupted")
      setLoading(false)
    }
  }, [id])

  // --- 2. ENCRYPTION & SUBMISSION ---
  const handleSubmit = async () => {
    try {
      // A. Prepare Answers Payload
      const payload = JSON.stringify(answers)

      // B. Generate Ephemeral Session Key (AES)
      const sessionKey = forge.random.getBytesSync(32)
      const iv = forge.random.getBytesSync(12)

      // C. Encrypt Answers with Session Key (AES-GCM)
      const cipher = forge.cipher.createCipher('AES-GCM', sessionKey)
      cipher.start({ iv: iv })
      cipher.update(forge.util.createBuffer(payload))
      cipher.finish()
      const encryptedData = cipher.output.getBytes()
      const tag = cipher.mode.tag.getBytes()

      // D. Encrypt Session Key with Public Key (RSA-OAEP)
      const pem = `-----BEGIN PUBLIC KEY-----\n${forge.util.encode64(keys.p).match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`
      const publicKey = forge.pki.publicKeyFromPem(pem)
      
      const encryptedSessionKey = publicKey.encrypt(sessionKey, 'RSA-OAEP', {
        md: forge.md.sha256.create()
      })

      // E. Package the Envelope
      const packageBlob = {
        key: forge.util.encode64(encryptedSessionKey), // How to unlock the box
        iv: forge.util.encode64(iv),
        tag: forge.util.encode64(tag),
        data: forge.util.encode64(encryptedData)       // The actual contents
      }

      await supabase.from('responses').insert({ form_id: id, response: packageBlob })
      
      alert('Response encrypted & submitted successfully!')
      setAnswers({}); setIndex(0)
      
    } catch (e) {
      console.error(e)
      alert('Encryption Error: ' + e.message)
    }
  }

  // --- 3. VALIDATION & NAVIGATION ---
  const handleNext = () => {
    const q = questions[index]
    const val = answers[q.id]
    
    // Check Required
    if (q.required && !['title','info','consent'].includes(q.question_type)) {
      // Basic check for string or empty array
      if (!val || (Array.isArray(val) && val.length === 0) || (typeof val === 'object' && Object.keys(val).length === 0)) { 
        alert('This question is required.'); return 
      }
      // Special check for Contact Info (require Name at minimum)
      if (q.question_type === 'contact_info' && !val['Name']) {
        alert('Name is required.'); return
      }
    }

    if (index < questions.length - 1) {
      setIndex(index + 1); setConsentChecked(false)
    } else {
      handleSubmit()
    }
  }

  // --- 4. RENDERER ---
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500 font-mono">Decrypting Secure Connection...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold p-10 bg-red-50">{error}</div>
  if (questions.length === 0) return <div className="min-h-screen flex items-center justify-center text-slate-400">No active questions.</div>

  const q = questions[index]
  const val = answers[q.id]

  // Helper to update specific fields for Contact Info
  const updateContact = (field, text) => {
    const current = val || {}
    setAnswers({ ...answers, [q.id]: { ...current, [field]: text } })
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col items-center">
      
      {/* Top Progress Bar */}
      <div className="w-full h-2 bg-slate-200 fixed top-0 z-50">
        <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="w-full flex-grow flex flex-col justify-center items-center py-10 px-4 md:px-8">
        
        {/* THE CARD: 
            - 16:9 Aspect Ratio (aspect-video)
            - Max Width 6XL (approx 1150px) to match "HD Slide" feel
            - White bg, heavy shadow, rounded-2xl
        */}
        <div className="w-full max-w-6xl aspect-video bg-white rounded-3xl shadow-2xl border border-slate-200 p-8 md:p-16 flex flex-col relative overflow-y-auto">
          
          {/* Security Badge */}
          <div className="flex justify-center mb-8">
            <span className="bg-green-50 text-green-700 text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-2 uppercase tracking-widest border border-green-200 shadow-sm">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
              End-to-End Encrypted
            </span>
          </div>

          <div className="flex-grow flex flex-col justify-center max-w-4xl mx-auto w-full">
            
            {/* Question Title */}
            <h1 className="text-3xl md:text-5xl font-extrabold mb-6 text-center leading-tight text-slate-900">
              {q.question_text}
              {q.required && <span className="text-red-500 ml-1" title="Required">*</span>}
            </h1>

            {/* Description */}
            {q.description && (
              <p className="text-xl text-slate-500 mb-12 text-center whitespace-pre-wrap leading-relaxed max-w-3xl mx-auto">{q.description}</p>
            )}

            {/* --- INPUT RENDERER --- */}
            <div className="w-full space-y-6">
              
              {/* TEXT / EMAIL / PHONE / NUMBER */}
              {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
                <input 
                  type={q.question_type === 'number' ? 'number' : 'text'} 
                  className="w-full bg-transparent border-b-4 border-slate-200 text-3xl md:text-4xl py-6 text-center focus:outline-none focus:border-blue-600 transition-colors placeholder-slate-300 font-medium" 
                  placeholder="Type your answer..." 
                  autoFocus
                  value={val || ''} 
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} 
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                />
              )}

              {/* LONG TEXT */}
              {q.question_type === 'long_text' && (
                <textarea 
                  className="w-full p-6 text-2xl border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50 transition-all min-h-[250px] resize-none" 
                  placeholder="Type here..."
                  autoFocus
                  value={val || ''} 
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} 
                />
              )}

              {/* SINGLE CHOICE / YES_NO */}
              {['single_choice', 'yes_no'].includes(q.question_type) && (
                <div className="grid gap-4 md:grid-cols-1 max-w-2xl mx-auto">
                  {(q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                    <button 
                      key={i} 
                      onClick={() => setAnswers({ ...answers, [q.id]: opt })} 
                      className={`w-full text-left p-6 rounded-2xl border-2 text-xl font-bold transition-all transform active:scale-[0.99] flex items-center ${
                        val === opt 
                          ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-100' 
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className={`mr-4 w-8 h-8 flex items-center justify-center border rounded-lg text-sm ${val===opt ? 'border-blue-300 bg-white' : 'border-slate-300 text-slate-400'}`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* CHECKBOX */}
              {q.question_type === 'checkbox' && (
                 <div className="grid gap-4 max-w-2xl mx-auto">
                   {q.options.map((opt, i) => {
                     const curr = val ? JSON.parse(val) : []
                     const checked = curr.includes(opt)
                     return (
                       <label key={i} className={`flex items-center w-full p-6 rounded-2xl border-2 cursor-pointer transition-all ${checked ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                         <div className={`w-8 h-8 mr-5 border-2 rounded-lg flex items-center justify-center transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                           {checked && <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                         </div>
                         <input type="checkbox" className="hidden" checked={checked} 
                            onChange={(e) => { 
                              let newSel = [...curr]
                              if (e.target.checked) newSel.push(opt)
                              else newSel = newSel.filter(x => x !== opt)
                              setAnswers({ ...answers, [q.id]: JSON.stringify(newSel) }) 
                            }} 
                          />
                         <span className={`text-xl font-bold ${checked ? 'text-blue-700' : 'text-slate-700'}`}>{opt}</span>
                       </label>
                     )
                   })}
                 </div>
              )}

              {/* CONSENT */}
              {q.question_type === 'consent' && (
                 <label className={`flex items-start p-8 border-2 rounded-2xl cursor-pointer transition-all max-w-2xl mx-auto ${consentChecked ? 'border-green-500 bg-green-50 ring-4 ring-green-100' : 'border-slate-300 hover:border-slate-400 bg-white'}`}>
                   <div className={`mt-1 w-8 h-8 mr-5 border-2 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${consentChecked ? 'bg-green-600 border-green-600' : 'border-slate-300 bg-white'}`}>
                      {consentChecked && <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                   </div>
                   <input type="checkbox" className="hidden" checked={consentChecked} 
                      onChange={(e) => {
                        setConsentChecked(e.target.checked)
                        setAnswers({ ...answers, [q.id]: e.target.checked ? "Agreed" : "" })
                      }} 
                    />
                   <div className="flex-1">
                     <span className="text-xl font-bold text-slate-900 block mb-2">I Agree</span>
                     <span className="text-lg text-slate-500">I have read and accept the terms and conditions presented.</span>
                   </div>
                 </label>
              )}

              {/* DROPDOWN */}
              {q.question_type === 'dropdown' && (
                <div className="max-w-xl mx-auto">
                  <select 
                    className="w-full p-5 text-xl border-2 border-slate-200 rounded-xl bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none appearance-none cursor-pointer"
                    value={val || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  >
                    <option value="" disabled>Select an option...</option>
                    {q.options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                  </select>
                </div>
              )}

              {/* SLIDER / RATING */}
              {['rating', 'slider'].includes(q.question_type) && (
                <div className="max-w-3xl mx-auto pt-10 px-4">
                  <div className="relative mb-6">
                    <input 
                      type="range" 
                      min={1} 
                      max={10} 
                      step={1}
                      value={val || 5} 
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between mt-4 text-slate-400 font-bold uppercase tracking-wider text-sm">
                      <span>Low</span>
                      <span>High</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <span className="text-6xl font-bold text-blue-600">{val || 5}</span>
                  </div>
                </div>
              )}

              {/* DATE */}
              {q.question_type === 'date' && (
                <div className="max-w-xs mx-auto">
                  <input 
                    type="date" 
                    className="w-full p-5 text-xl border-2 border-slate-200 rounded-xl focus:border-blue-600 outline-none text-center text-slate-700 bg-white"
                    value={val || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                </div>
              )}

              {/* CONTACT INFO */}
              {q.question_type === 'contact_info' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                  {['Name', 'Email', 'Phone', 'Company'].map((field) => (
                    <div key={field}>
                      <label className="block text-sm font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">{field}</label>
                      <input 
                        type={field === 'Email' ? 'email' : (field === 'Phone' ? 'tel' : 'text')}
                        className="w-full p-4 text-lg border-2 border-slate-200 rounded-xl focus:border-blue-600 outline-none transition-colors"
                        placeholder={`Your ${field}`}
                        value={(val || {})[field] || ''}
                        onChange={(e) => updateContact(field, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-12 pt-8 border-t border-slate-100">
             <button 
                onClick={() => index > 0 && setIndex(index-1)} 
                className={`text-slate-400 hover:text-slate-600 font-bold px-6 py-3 text-lg transition-colors flex items-center gap-2 ${index === 0 ? 'invisible' : ''}`}
             >
               ← Back
             </button>
             
             <button 
                onClick={handleNext} 
                disabled={q.question_type === 'consent' && !consentChecked}
                className={`text-white text-xl font-bold py-4 px-12 rounded-2xl shadow-xl transition-all transform active:scale-95 flex items-center gap-3 ${
                  q.question_type === 'consent' && !consentChecked 
                    ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                    : 'bg-blue-600 hover:bg-blue-700 hover:shadow-2xl hover:-translate-y-1'
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