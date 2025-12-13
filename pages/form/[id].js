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

  // --- 1. INITIALIZE & DECRYPT QUESTIONS ---
  useEffect(() => {
    if (!id) return

    // Extract Keys from URL Hash (Never sent to server)
    // Format: #q=<AES_KEY_FOR_QUESTIONS>&p=<RSA_PUBLIC_KEY_FOR_ANSWERS>
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const qKeyB64 = hashParams.get('q')
    const pKeyB64 = hashParams.get('p')

    if (!qKeyB64 || !pKeyB64) {
      setError('MISSING KEYS: Use the full secure link provided by the software.')
      setLoading(false)
      return
    }

    // Decode Keys
    try {
      // Python sends URL-safe base64, usually standard is fine but good to be robust
      const qKey = forge.util.decode64(qKeyB64)
      const pKey = forge.util.decode64(pKeyB64)
      setKeys({ q: qKey, p: pKey })

      // Fetch Encrypted Data
      const fetchData = async () => {
        let { data: rawData, error: dbError } = await supabase
          .from('questions')
          .select('*')
          .eq('form_id', id)
          .order('order')

        if (dbError) throw dbError

        // Decrypt Rows (AES-GCM)
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
              const success = decipher.finish()
              
              if(success) return JSON.parse(decipher.output.toString())
              return "[Decryption Failed]"
            } catch (e) {
              console.error(e)
              return "[Corrupt Data]"
            }
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
      setError("Invalid Key Format")
      setLoading(false)
    }
  }, [id])

  // --- 2. ENCRYPT & SUBMIT ANSWERS ---
  const handleSubmit = async () => {
    try {
      // A. Prepare Payload
      const payload = JSON.stringify(answers)

      // B. Generate One-Time Session Key (AES)
      const sessionKey = forge.random.getBytesSync(32)
      const iv = forge.random.getBytesSync(12)

      // C. Encrypt Payload (AES-GCM)
      const cipher = forge.cipher.createCipher('AES-GCM', sessionKey)
      cipher.start({ iv: iv })
      cipher.update(forge.util.createBuffer(payload))
      cipher.finish()
      const encryptedData = cipher.output.getBytes()
      const tag = cipher.mode.tag.getBytes()

      // D. Encrypt Session Key with Public Key (RSA-OAEP)
      // We wrap the PEM properly
      const pem = `-----BEGIN PUBLIC KEY-----\n${forge.util.encode64(keys.p).match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`
      const publicKey = forge.pki.publicKeyFromPem(pem)
      
      const encryptedSessionKey = publicKey.encrypt(sessionKey, 'RSA-OAEP', {
        md: forge.md.sha256.create()
      })

      // E. Package for Server
      // We send a JSON blob containing the encrypted key and the encrypted data
      const packageBlob = {
        key: forge.util.encode64(encryptedSessionKey),
        iv: forge.util.encode64(iv),
        tag: forge.util.encode64(tag),
        data: forge.util.encode64(encryptedData)
      }

      await supabase.from('responses').insert({ form_id: id, response: packageBlob })
      
      alert('Encrypted response submitted successfully!')
      // Reset or redirect
      setAnswers({})
      setIndex(0)
      
    } catch (e) {
      console.error(e)
      alert('Encryption Error: ' + e.message)
    }
  }

  // --- RENDERERS ---
  const handleNext = () => {
    const q = questions[index]
    const val = answers[q.id]
    
    // Simple Validation
    if (q.required && !['title','info','consent'].includes(q.question_type)) {
      if (!val || (Array.isArray(val) && val.length === 0)) { 
        alert('Please complete this field.'); return 
      }
    }

    if (index < questions.length - 1) {
      setIndex(index + 1)
      setConsentChecked(false)
    } else {
      handleSubmit()
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Decrypting Secure Survey...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold p-10 text-center bg-red-50">{error}</div>
  if (questions.length === 0) return <div className="min-h-screen flex items-center justify-center">No questions found.</div>

  const q = questions[index]
  const val = answers[q.id]

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 flex flex-col items-center">
      
      {/* Progress Bar */}
      <div className="w-full h-1 bg-slate-200 fixed top-0 z-50">
        <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="w-full max-w-2xl px-6 py-20 flex-grow flex flex-col justify-center">
        
        {/* Secure Badge */}
        <div className="mb-8 flex justify-center">
          <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 uppercase tracking-wide border border-green-200">
            🔒 End-to-End Encrypted
          </span>
        </div>

        {/* Question Title */}
        <h1 className="text-3xl md:text-4xl font-bold mb-4 text-center leading-tight">
          {q.question_text}
          {q.required && <span className="text-red-500 ml-1 text-2xl">*</span>}
        </h1>

        {/* Description */}
        {q.description && (
          <p className="text-lg text-slate-500 mb-10 text-center whitespace-pre-wrap max-w-lg mx-auto">{q.description}</p>
        )}

        {/* Input Area */}
        <div className="w-full">
          
          {/* TEXT / EMAIL / PHONE */}
          {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
            <input 
              type={q.question_type === 'number' ? 'tel' : 'text'} 
              className="w-full bg-transparent border-b-2 border-slate-300 text-3xl py-4 focus:outline-none focus:border-blue-600 transition-colors text-center placeholder-slate-300" 
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
              className="w-full p-4 text-xl border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50 transition-all min-h-[150px] resize-none" 
              placeholder="Type here..."
              autoFocus
              value={val || ''} 
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} 
            />
          )}

          {/* CHOICES */}
          {['single_choice', 'yes_no'].includes(q.question_type) && (
            <div className="space-y-3">
              {(q.question_type === 'yes_no' ? ['Yes', 'No'] : q.options).map((opt, i) => (
                <button 
                  key={i} 
                  onClick={() => setAnswers({ ...answers, [q.id]: opt })} 
                  className={`w-full text-left p-5 rounded-xl border-2 text-lg font-medium transition-all transform active:scale-[0.99] ${
                    val === opt 
                      ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-100' 
                      : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="mr-3 text-slate-400 font-normal border border-slate-200 rounded px-2 py-0.5 text-sm">{String.fromCharCode(65 + i)}</span>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* CHECKBOXES */}
          {q.question_type === 'checkbox' && (
             <div className="space-y-3">
               {q.options.map((opt, i) => {
                 const curr = val ? JSON.parse(val) : []
                 const checked = curr.includes(opt)
                 return (
                   <label key={i} className={`flex items-center w-full p-5 rounded-xl border-2 cursor-pointer transition-all ${checked ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                     <div className={`w-6 h-6 mr-4 border-2 rounded flex items-center justify-center transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                       {checked && <span className="text-white font-bold text-sm">✓</span>}
                     </div>
                     <input 
                        type="checkbox" 
                        className="hidden"
                        checked={checked} 
                        onChange={(e) => { 
                          let newSel = [...curr]
                          if (e.target.checked) newSel.push(opt)
                          else newSel = newSel.filter(x => x !== opt)
                          setAnswers({ ...answers, [q.id]: JSON.stringify(newSel) }) 
                        }} 
                      />
                     <span className={`text-lg font-medium ${checked ? 'text-blue-700' : 'text-slate-700'}`}>{opt}</span>
                   </label>
                 )
               })}
             </div>
          )}

          {/* SLIDER / RATING */}
          {['slider', 'rating'].includes(q.question_type) && (
             <div className="py-8 bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
               <div className="text-center text-6xl font-black text-blue-600 mb-8 font-mono">
                  {val || 5}
               </div>
               <input 
                  type="range" 
                  min={1} max={10} 
                  value={val || 5} 
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} 
                  className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" 
                />
               <div className="flex justify-between mt-4 text-slate-400 text-sm font-bold uppercase tracking-wider">
                 <span>Low (1)</span>
                 <span>High (10)</span>
               </div>
             </div>
          )}

          {/* CONSENT */}
          {q.question_type === 'consent' && (
             <label className={`flex items-start p-6 border-2 rounded-xl cursor-pointer transition-all ${consentChecked ? 'border-green-500 bg-green-50 ring-2 ring-green-100' : 'border-slate-300 hover:border-slate-400'}`}>
               <div className={`mt-1 w-6 h-6 mr-4 border-2 rounded flex items-center justify-center transition-colors ${consentChecked ? 'bg-green-600 border-green-600' : 'border-slate-300 bg-white'}`}>
                  {consentChecked && <span className="text-white font-bold text-sm">✓</span>}
               </div>
               <input 
                  type="checkbox" 
                  className="hidden"
                  checked={consentChecked} 
                  onChange={(e) => {
                    setConsentChecked(e.target.checked)
                    setAnswers({ ...answers, [q.id]: e.target.checked ? "Agreed" : "" })
                  }} 
                />
               <div className="flex-1">
                 <span className="text-lg font-bold text-slate-900 block mb-1">I Agree</span>
                 <span className="text-slate-500">I have read and accept the terms and conditions outlined in the previous slides.</span>
               </div>
             </label>
          )}

          {/* DROPDOWN */}
          {q.question_type === 'dropdown' && (
            <div className="relative">
              <select 
                className="w-full p-4 text-xl border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 appearance-none bg-white"
                value={val || ''}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              >
                <option value="">Select an option...</option>
                {q.options.map((opt, i) => (
                  <option key={i} value={opt}>{opt}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
            </div>
          )}

        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-12">
           <button 
              onClick={() => index > 0 && setIndex(index-1)} 
              className={`text-slate-400 hover:text-slate-600 font-bold px-6 py-3 transition-colors ${index === 0 ? 'invisible' : ''}`}
            >
              Back
           </button>
           
           <button 
              onClick={handleNext} 
              disabled={q.question_type === 'consent' && !consentChecked}
              className={`text-white text-lg font-bold py-4 px-10 rounded-xl shadow-lg transition-all transform active:scale-95 ${
                q.question_type === 'consent' && !consentChecked 
                  ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-xl hover:-translate-y-1'
              }`}
            >
              {index < questions.length - 1 ? (q.button_text || 'Next') : 'Submit Securely'}
           </button>
        </div>

      </div>
      
      {/* Footer Branding */}
      <div className="fixed bottom-6 text-slate-300 text-sm font-medium">
        Powered by SlideForm Secure
      </div>

    </div>
  )
}