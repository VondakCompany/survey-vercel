import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import fernet from 'fernet'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [secret, setSecret] = useState(null)
  const [consentChecked, setConsentChecked] = useState(false)

  useEffect(() => {
    if (!id) return

    // 1. EXTRACT DECRYPTION KEY FROM URL HASH
    // The key is in the hash (#key=...) so it is NEVER sent to the server.
    const hash = window.location.hash
    const keyMatch = hash.match(/key=([^&]*)/)
    
    if (!keyMatch) {
      setError('MISSING KEY: This survey is encrypted. You need the full link containing the decryption key.')
      setLoading(false)
      return
    }

    const keyStr = keyMatch[1]
    
    // Setup Fernet Secret
    const secret = new fernet.Secret(keyStr)
    setSecret(secret)

    // 2. FETCH ENCRYPTED DATA
    const fetchData = async () => {
      let { data: rawData, error: dbError } = await supabase
        .from('questions')
        .select('*')
        .eq('form_id', id)
        .order('order')

      if (dbError) { setError(dbError.message); setLoading(false); return }

      // 3. DECRYPT LOCALLY
      try {
        const decrypted = rawData.map(q => {
          // Decrypt Helper
          const decrypt = (cipher) => {
            if (!cipher) return ""
            const token = new fernet.Token({ secret, token: cipher, ttl: 0 })
            return token.decode()
          }

          return {
            ...q,
            question_text: decrypt(q.question_text),
            description: decrypt(q.description),
            // Options are stored as an encrypted JSON string
            options: JSON.parse(decrypt(q.options) || "[]") 
          }
        })
        setQuestions(decrypted)
      } catch (e) {
        console.error(e)
        setError('DECRYPTION FAILED: The key provided does not match this survey.')
      }
      setLoading(false)
    }

    fetchData()
  }, [id])

  const handleNext = async () => {
    const q = questions[index]
    const val = answers[q.id]
    
    // Validation
    if (q.required && !['title','info','consent'].includes(q.question_type)) {
      if (!val || val.length === 0) { alert('This field is required'); return }
    }

    if (index < questions.length - 1) {
      setIndex(index + 1)
      setConsentChecked(false)
    } else {
      await submitData()
    }
  }

  const submitData = async () => {
    // 4. ENCRYPT ANSWERS BEFORE SENDING
    // We encrypt every answer individually
    const encryptedResponse = {}
    
    Object.keys(answers).forEach(qid => {
      const val = answers[qid]
      // Convert answer to string (even if array/json)
      const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val)
      
      const token = new fernet.Token({ secret, time: Date.now() })
      encryptedResponse[qid] = token.encode(strVal)
    })

    const { error } = await supabase
      .from('responses')
      .insert({ form_id: id, response: encryptedResponse }) // Send ONLY ciphertext

    if (error) alert('Error saving: ' + error.message)
    else {
      alert('Response submitted securely!')
      router.push('/')
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Decrypting Survey...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold p-10 text-center">{error}</div>
  if (questions.length === 0) return <div className="min-h-screen flex items-center justify-center">No questions found.</div>

  const q = questions[index]
  const val = answers[q.id]

  // --- RENDERER ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 flex flex-col items-center">
      
      {/* Progress Bar */}
      <div className="w-full h-1 bg-slate-200 fixed top-0">
        <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="w-full max-w-2xl px-6 py-20 flex-grow flex flex-col justify-center">
        
        {/* Secure Badge */}
        <div className="mb-8 flex justify-center">
          <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 uppercase tracking-wide">
            🔒 End-to-End Encrypted
          </span>
        </div>

        {/* Question Title */}
        <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center leading-tight">
          {q.question_text}
          {q.required && <span className="text-red-500 ml-1">*</span>}
        </h1>

        {/* Description */}
        {q.description && (
          <p className="text-lg text-slate-500 mb-10 text-center whitespace-pre-wrap">{q.description}</p>
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
              className="w-full p-4 text-xl border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50 transition-all min-h-[150px]" 
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
                  onClick={() => {
                    setAnswers({ ...answers, [q.id]: opt })
                    // Auto advance for single choice often feels better, but optional
                  }} 
                  className={`w-full text-left p-5 rounded-xl border-2 text-lg font-medium transition-all transform active:scale-[0.99] ${
                    val === opt 
                      ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm' 
                      : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="mr-3 text-slate-400 font-normal">{String.fromCharCode(65 + i)}</span>
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
                   <label key={i} className={`flex items-center w-full p-5 rounded-xl border-2 cursor-pointer transition-all ${checked ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                     <input 
                        type="checkbox" 
                        className="w-6 h-6 mr-4 accent-blue-600" 
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
             <div className="py-8">
               <div className="text-center text-6xl font-black text-blue-600 mb-8 font-mono">
                  {val || Math.ceil((1 + 10)/2)}
               </div>
               <input 
                  type="range" 
                  min="1" max="10" 
                  value={val || 5} 
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} 
                  className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" 
                />
               <div className="flex justify-between mt-4 text-slate-400 text-sm font-bold uppercase tracking-wider">
                 <span>Low</span>
                 <span>High</span>
               </div>
             </div>
          )}

          {/* CONSENT */}
          {q.question_type === 'consent' && (
             <label className={`flex items-start p-6 border-2 rounded-xl cursor-pointer transition-all ${consentChecked ? 'border-green-500 bg-green-50' : 'border-slate-300'}`}>
               <input 
                  type="checkbox" 
                  className="mt-1.5 w-6 h-6 mr-4 accent-green-600" 
                  checked={consentChecked} 
                  onChange={(e) => {
                    setConsentChecked(e.target.checked)
                    setAnswers({ ...answers, [q.id]: e.target.checked ? "Agreed" : "" })
                  }} 
                />
               <span className="text-lg font-medium text-slate-700">I have read and agree to the terms above.</span>
             </label>
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