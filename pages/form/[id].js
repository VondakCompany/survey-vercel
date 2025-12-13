import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function FormPage() {
  const router = useRouter()
  const { id } = router.query
  
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [consentChecked, setConsentChecked] = useState(false) // Logic for consent slide
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    const fetchData = async () => {
      let { data: q, error: qErr } = await supabase.from('questions').select('*').eq('form_id', id).order('order')
      if (qErr) setError(qErr.message)
      else setQuestions(q)
      setLoading(false)
    }
    fetchData()
  }, [id])

  const handleNext = async () => {
    const q = questions[index]
    const val = answers[q.id]

    // LOGIC: Info/Title slides don't need validation
    const needsValidation = !['title', 'info', 'consent'].includes(q.question_type)

    if (needsValidation && q.required) {
      if (!val || (typeof val === 'string' && !val.trim())) { alert('Please fill this out'); return }
      if (q.question_type === 'checkbox' && (!val || val.length === 0)) { alert('Select at least one'); return }
    }

    if (val) {
       // ... (Keep your existing validation for email/phone here) ...
    }

    if (index < questions.length - 1) {
      setIndex(index + 1)
      setConsentChecked(false) // Reset consent for next slide if needed
    } else {
      await supabase.from('responses').insert({
        form_id: id,
        response: answers,
        created_at: new Date().toISOString()
      })
      alert('Response recorded!')
    }
  }

  if (loading) return <div className="p-10 text-center">Loading...</div>
  if (error) return <div className="p-10 text-center text-red-500">{error}</div>
  if (questions.length === 0) return <div className="p-10 text-center">No questions found.</div>

  const q = questions[index]
  const val = answers[q.id]
  let options = []
  try { options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options } catch (e) {}

  // --- RENDERERS ---
  
  // 1. TITLE SLIDE
  if (q.question_type === 'title') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-5xl font-black text-gray-900 mb-6">{q.question_text}</h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl">{q.description}</p>
        <button onClick={handleNext} className="bg-blue-600 text-white text-xl font-bold py-4 px-12 rounded-full hover:bg-blue-700 shadow-xl transition-transform transform active:scale-95">
          {q.button_text || "Start"}
        </button>
      </div>
    )
  }

  // 2. STANDARD CONTAINER
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {/* Progress */}
      <div className="fixed top-0 left-0 w-full h-2 bg-gray-200">
        <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="w-full max-w-2xl">
        {/* Header */}
        <h1 className="text-3xl font-light mb-4 text-gray-900">
          {q.question_type !== 'info' && q.question_type !== 'consent' && <span className="text-sm font-bold text-gray-400 mr-2">{index + 1} &rarr;</span>}
          {q.question_text}
          {q.required && !['info','consent'].includes(q.question_type) && <span className="text-red-500 ml-1">*</span>}
        </h1>
        {q.description && <p className="text-lg text-gray-500 mb-8 whitespace-pre-wrap">{q.description}</p>}

        {/* INPUTS */}
        <div className="mb-10">
          {/* INFO SLIDE (No Input) */}
          {q.question_type === 'info' && <div className="p-6 bg-blue-50 border border-blue-100 rounded-lg text-blue-800">ℹ️ Read the information above and click Next.</div>}

          {/* CONSENT SLIDE */}
          {q.question_type === 'consent' && (
             <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:bg-white transition-colors bg-gray-50">
               <input 
                 type="checkbox" 
                 className="w-6 h-6 mr-4 accent-blue-600"
                 checked={consentChecked}
                 onChange={(e) => {
                   setConsentChecked(e.target.checked)
                   setAnswers({ ...answers, [q.id]: e.target.checked ? "Agreed" : "" })
                 }}
               />
               <span className="text-lg font-bold text-gray-700">I have read and agree to the terms above.</span>
             </label>
          )}

          {/* STANDARD INPUTS (Text, Email, etc) */}
          {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
            <input
              type={q.question_type === 'number' ? 'text' : q.question_type}
              className="w-full bg-transparent border-b-2 border-blue-200 text-3xl py-2 focus:outline-none focus:border-blue-600 text-blue-800"
              placeholder="Type your answer..."
              value={val || ''}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            />
          )}
          
          {/* ... [Paste the rest of your inputs: Checkbox, Radio, Address, etc here] ... */}
          {/* (If you need the full file re-pasted with these included, let me know, but you can likely copy your previous logic here) */}

        </div>

        {/* NAV */}
        <div className="flex justify-between items-center mt-8">
           <button onClick={() => index > 0 && setIndex(index-1)} className={`text-gray-500 font-medium px-4 py-2 ${index===0 ? 'invisible':''}`}>Back</button>
           
           <button 
             onClick={handleNext}
             disabled={q.question_type === 'consent' && !consentChecked} // LOCK BUTTON FOR CONSENT
             className={`text-white text-xl font-bold py-3 px-8 rounded-lg shadow-lg transition-all ${
               q.question_type === 'consent' && !consentChecked 
               ? 'bg-gray-400 cursor-not-allowed' 
               : 'bg-blue-700 hover:bg-blue-800 active:scale-95'
             }`}
           >
             {index < questions.length - 1 ? (q.button_text || 'Next') : 'Submit'}
           </button>
        </div>
      </div>
    </div>
  )
}