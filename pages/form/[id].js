import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'

// --- CONFIG ---
const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function FormPage() {
  const router = useRouter()
  const { id } = router.query
  
  const [form, setForm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    const fetchData = async () => {
      let { data: f, error: fErr } = await supabase.from('forms').select('*').eq('id', id).single()
      if (fErr) { setError('Form not found'); setLoading(false); return }
      setForm(f)

      let { data: q, error: qErr } = await supabase.from('questions').select('*').eq('form_id', id).order('order')
      if (qErr) { setError(qErr.message); }
      else { setQuestions(q) }
      setLoading(false)
    }
    fetchData()
  }, [id])

  const handleNext = async () => {
    const q = questions[index]
    const val = answers[q.id]

    if (q.required) {
      if (!val || (typeof val === 'string' && !val.trim())) {
        alert('Please fill this out')
        return
      }
      if (q.question_type === 'checkbox' && (!val || val.length === 0)) {
         alert('Please select at least one option'); return;
      }
    }

    if (val) {
      if (q.question_type === 'email') {
        const re = /[^@]+@[^@]+\.[^@]+/
        if (!re.test(val)) { alert('Please enter a valid email address'); return; }
      }
      if (q.question_type === 'phone') {
        const re = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/
        if (!re.test(val) && val.length < 7) { alert('Please enter a valid phone number'); return; }
      }
      if (q.question_type === 'number') {
        if (isNaN(val)) { alert('Please enter a valid number'); return; }
      }
    }

    if (index < questions.length - 1) {
      setIndex(index + 1)
    } else {
      await supabase.from('responses').insert({
        form_id: id,
        response: answers,
        created_at: new Date().toISOString()
      })
      alert('Thank you! Your response has been recorded.')
    }
  }

  const handleBack = () => {
    if (index > 0) setIndex(index - 1)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleNext()
    }
  }

  if (loading) return <div className="p-10 text-center">Loading...</div>
  if (error) return <div className="p-10 text-center text-red-500">{error}</div>
  if (questions.length === 0) return <div className="p-10 text-center">This form has no questions.</div>

  const q = questions[index]
  const val = answers[q.id]
  
  let options = []
  try {
    options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options
  } catch (e) { options = [] }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans text-gray-800">
      
      <div className="fixed top-0 left-0 w-full h-2 bg-gray-200">
        <div 
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="w-full max-w-2xl bg-transparent">
        
        <h1 className="text-3xl font-light mb-2 text-gray-900">
          <span className="text-sm font-bold text-gray-400 mr-2">{index + 1} &rarr;</span>
          {q.question_text}
          {q.required && <span className="text-red-500 ml-1">*</span>}
        </h1>
        
        {q.description && (
          <p className="text-lg text-gray-500 mb-8 whitespace-pre-wrap">{q.description}</p>
        )}

        <div className="mb-10">
          
          {['text', 'email', 'phone', 'number'].includes(q.question_type) && (
            <input
              type={q.question_type === 'number' ? 'text' : q.question_type}
              inputMode={q.question_type === 'number' ? 'numeric' : 'text'}
              className="w-full bg-transparent border-b-2 border-blue-200 text-3xl py-2 focus:outline-none focus:border-blue-600 text-blue-800 placeholder-gray-300"
              placeholder="Type your answer..."
              value={val || ''}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          )}

          {q.question_type === 'long_text' && (
            <textarea
              className="w-full bg-transparent border-2 border-blue-200 rounded-md text-xl p-4 focus:outline-none focus:border-blue-600 text-blue-800"
              rows={4}
              placeholder="Type your answer here..."
              value={val || ''}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              autoFocus
            />
          )}

          {['single_choice', 'yes_no'].includes(q.question_type) && (
            <div className="space-y-3">
              {(q.question_type === 'yes_no' ? ['Yes', 'No'] : options).map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                  className={`block w-full text-left p-4 rounded-md border text-lg transition-all ${
                    val === opt 
                      ? 'bg-blue-600 text-white border-blue-600' 
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-bold mr-4 opacity-50">{String.fromCharCode(65 + i)}</span>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.question_type === 'checkbox' && (
             <div className="space-y-3">
               {options.map((opt, i) => {
                 const current = val ? val.split(',') : []
                 const checked = current.includes(opt)
                 return (
                   <label key={i} className={`flex items-center w-full p-4 rounded-md border cursor-pointer text-lg ${checked ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-200'}`}>
                     <input 
                       type="checkbox" 
                       className="w-5 h-5 mr-4 accent-blue-600"
                       checked={checked}
                       onChange={(e) => {
                         let newSel = [...current]
                         if (e.target.checked) newSel.push(opt)
                         else newSel = newSel.filter(x => x !== opt)
                         setAnswers({ ...answers, [q.id]: newSel.join(',') })
                       }}
                     />
                     {opt}
                   </label>
                 )
               })}
             </div>
          )}

          {q.question_type === 'dropdown' && (
            <select 
              className="w-full p-4 text-xl border rounded-md bg-white focus:outline-none focus:border-blue-600"
              value={val || ''}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            >
              <option value="">Select an option...</option>
              {options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
            </select>
          )}

          {q.question_type === 'rating' && (
            <div className="flex gap-4 flex-wrap">
              {Array.from({ length: (options.max || 5) - (options.min || 1) + 1 }, (_, i) => i + (options.min || 1)).map(num => (
                <button
                  key={num}
                  onClick={() => setAnswers({ ...answers, [q.id]: String(num) })}
                  className={`w-14 h-14 rounded-lg border-2 text-xl font-bold transition-all ${
                    val === String(num) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          )}

          {q.question_type === 'slider' && (
            <div className="pt-8 px-2">
              <div className="text-center text-4xl font-bold text-blue-700 mb-4">{val || options.min || 0}</div>
              <input 
                type="range" 
                min={options.min || 0} 
                max={options.max || 10} 
                value={val || options.min || 0}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-gray-400 mt-2">
                <span>{options.min || 0}</span>
                <span>{options.max || 10}</span>
              </div>
            </div>
          )}

          {q.question_type === 'date' && (
            <input 
              type="date"
              className="w-full p-4 text-xl border rounded-md bg-white focus:outline-none focus:border-blue-600"
              value={val || ''}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            />
          )}

          {q.question_type === 'contact_info' && (
            <div className="space-y-4">
              {['name', 'email', 'phone', 'company'].map(field => {
                 const currentObj = val ? JSON.parse(val) : {}
                 return (
                   <div key={field} className="flex flex-col">
                     <label className="text-xs font-bold uppercase text-gray-500 mb-1">{field}</label>
                     <input 
                       type={field === 'email' ? 'email' : 'text'}
                       className="p-3 border rounded-md focus:border-blue-600 outline-none"
                       placeholder={`Enter ${field}...`}
                       value={currentObj[field] || ''}
                       onChange={(e) => {
                         const newObj = { ...currentObj, [field]: e.target.value }
                         setAnswers({ ...answers, [q.id]: JSON.stringify(newObj) })
                       }}
                     />
                   </div>
                 )
              })}
            </div>
          )}

           {q.question_type === 'address' && (
            <div className="space-y-4">
              {['street', 'city', 'zip', 'country'].map(field => {
                 const currentObj = val ? JSON.parse(val) : {}
                 return (
                   <div key={field} className="flex flex-col">
                     <label className="text-xs font-bold uppercase text-gray-500 mb-1">{field}</label>
                     <input 
                       type="text"
                       className="p-3 border rounded-md focus:border-blue-600 outline-none"
                       placeholder={`Enter ${field}...`}
                       value={currentObj[field] || ''}
                       onChange={(e) => {
                         const newObj = { ...currentObj, [field]: e.target.value }
                         setAnswers({ ...answers, [q.id]: JSON.stringify(newObj) })
                       }}
                     />
                   </div>
                 )
              })}
            </div>
          )}

        </div>

        <div className="flex justify-between items-center mt-8">
          {index > 0 ? (
            <button 
              onClick={handleBack} 
              className="text-gray-500 hover:text-gray-800 font-medium px-4 py-2"
            >
              Back
            </button>
          ) : <div></div>}
          
          <button 
            onClick={handleNext}
            className="bg-blue-700 hover:bg-blue-800 text-white text-xl font-bold py-3 px-8 rounded-lg shadow-lg transition-transform transform active:scale-95"
          >
            {index < questions.length - 1 ? (q.button_text || 'OK') : 'Submit'}
          </button>
        </div>

      </div>
    </div>
  )
}