import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'

// --- CONFIG ---
const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Helper functions for slide types
const isQuestionSlide = (type) => !['title_slide', 'info_slide', 'consent_slide'].includes(type)
const isPresentationSlide = (type) => ['title_slide', 'info_slide'].includes(type)
const isConsentSlide = (type) => type === 'consent_slide'

export default function FormPage() {
    const router = useRouter()
    const { id } = router.query
    
    const [questions, setQuestions] = useState([])
    const [index, setIndex] = useState(0)
    const [answers, setAnswers] = useState({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // --- 1. Fetch Questions ---
    useEffect(() => {
        if (!id) return
        const fetchData = async () => {
            // Note: Forms table data is not used for rendering in this simplified version
            // Fetch questions directly
            let { data: q, error: qErr } = await supabase.from('questions').select('*').eq('form_id', id).order('order')
            
            if (qErr) { 
                setError(qErr.message); 
            } else if (!q || q.length === 0) {
                 setError('No questions found for this form ID.');
            }
            else { 
                setQuestions(q) 
            }
            setLoading(false)
        }
        fetchData()
    }, [id])

    // --- 2. Handle Navigation and Submission ---
    const handleNext = async () => {
        const q = questions[index]
        const val = answers[q.id]
        
        // 1. Validation Logic
        if (isQuestionSlide(q.question_type) || isConsentSlide(q.question_type)) {
            
            // Check required fields (including consent which is mandatory)
            if (q.required || isConsentSlide(q.question_type)) {
                if (!val || (typeof val === 'string' && !val.trim())) {
                    alert(isConsentSlide(q.question_type) ? 'Please indicate your choice to continue.' : 'Please fill this out')
                    return
                }
            }

            // Specific Consent Check (must be "I Consent" to proceed)
            if (isConsentSlide(q.question_type) && val === 'I Do Not Consent') {
                alert('You must consent to continue this survey.')
                return;
            }

            // Question-specific validation (only if value exists)
            if (val) {
                if (q.question_type === 'checkbox' && (!val || val.split(',').length === 0)) {
                    alert('Please select at least one option'); return;
                }
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
        }
        
        // 2. Advance Slide
        if (index < questions.length - 1) {
            setIndex(index + 1)
        } else {
            // Filter answers to only include data-collecting questions
            const responseData = {}
            questions.forEach(q => {
                if (isQuestionSlide(q.question_type) || isConsentSlide(q.question_type)) {
                    responseData[q.id] = answers[q.id]
                }
            })

            await supabase.from('responses').insert({
                form_id: id,
                response: responseData,
                created_at: new Date().toISOString()
            })
            // Redirect to a confirmation page
            router.push('/form/confirmed')
        }
    }

    const handleBack = () => {
        if (index > 0) setIndex(index - 1)
    }

    const handleKeyDown = (e) => {
        // Only proceed on Enter if it's a direct text input field
        if (e.key === 'Enter' && ['INPUT'].includes(e.target.tagName)) {
            e.preventDefault()
            handleNext()
        }
    }

    if (loading) return <div className="p-10 text-center">Loading...</div>
    if (error) return <div className="p-10 text-center text-red-500">{error}</div>
    if (questions.length === 0) return <div className="p-10 text-center">This form has no questions.</div>

    const q = questions[index]
    let val = answers[q.id]

    // Determine visual style based on slide type
    const questionClass = isPresentationSlide(q.question_type) ? 'text-5xl font-extrabold text-slate-800' : 'text-3xl font-light text-gray-900';
    
    // Parse options (handles JSON array, JSON object, or comma-separated string)
    let options = []
    try {
        const parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options
        if (Array.isArray(parsedOptions)) {
            options = parsedOptions
        } else {
            // Assume it's an object for range or complex types
            options = parsedOptions
        }
    } catch (e) { 
        // Fallback for simple string options (e.g., in contact_info/address which might store JSON string)
        options = []
    }


    // --- RENDER START ---
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans text-gray-800">
            
            {/* Progress Bar */}
            <div className="fixed top-0 left-0 w-full h-2 bg-gray-200">
                <div 
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${((index + 1) / questions.length) * 100}%` }}
                />
            </div>

            <div className="w-full max-w-2xl bg-transparent">
                
                {/* Question / Title Block */}
                <h1 className={`${questionClass} mb-2 leading-snug transition-colors`}>
                    {/* Hide question number on Title/Info slides */}
                    {!isPresentationSlide(q.question_type) && (
                         <span className="text-sm font-bold text-gray-400 mr-2">{index + 1} &rarr;</span>
                    )}
                    {q.question_text}
                    {q.required && !isConsentSlide(q.question_type) && <span className="text-red-500 ml-1">*</span>}
                </h1>
                
                {/* Description / Body Text Block */}
                {q.description && (
                    <p className="text-lg text-gray-500 mb-8 whitespace-pre-wrap">
                        {isConsentSlide(q.question_type) ? <b>Consent Statement:</b> : ''} {q.description}
                    </p>
                )}

                {/* Input Area */}
                <div className="mb-10 min-h-[150px]">
                    
                    {/* Placeholder for presentation slides (no input needed) */}
                    {isPresentationSlide(q.question_type) && (
                        <div className="h-full text-gray-400 text-xl pt-10">... (Click {q.button_text || 'Next'} to continue)</div>
                    )}

                    {/* CONSENT SLIDE INPUT */}
                    {isConsentSlide(q.question_type) && (
                        <div className="space-y-3 pt-5">
                            {['I Consent', 'I Do Not Consent'].map((opt, i) => (
                                <button
                                    key={i}
                                    onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                                    className={`block w-full text-center p-4 rounded-md border text-lg transition-all ${
                                        val === opt 
                                            ? (opt === 'I Consent' ? 'bg-green-600 border-green-600' : 'bg-red-600 border-red-600')
                                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                    } text-white`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {/* TEXT INPUT TYPES */}
                    {isQuestionSlide(q.question_type) && ['text', 'email', 'phone', 'number'].includes(q.question_type) && (
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

                    {/* LONG TEXT */}
                    {isQuestionSlide(q.question_type) && q.question_type === 'long_text' && (
                        <textarea
                            className="w-full bg-transparent border-2 border-blue-200 rounded-md text-xl p-4 focus:outline-none focus:border-blue-600 text-blue-800"
                            rows={4}
                            placeholder="Type your answer here..."
                            value={val || ''}
                            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                            autoFocus
                        />
                    )}

                    {/* SINGLE CHOICE / YES NO */}
                    {isQuestionSlide(q.question_type) && ['single_choice', 'yes_no'].includes(q.question_type) && (
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

                    {/* CHECKBOX */}
                    {isQuestionSlide(q.question_type) && q.question_type === 'checkbox' && (
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

                    {/* DROPDOWN */}
                    {isQuestionSlide(q.question_type) && q.question_type === 'dropdown' && (
                        <select 
                            className="w-full p-4 text-xl border rounded-md bg-white focus:outline-none focus:border-blue-600"
                            value={val || ''}
                            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        >
                            <option value="">Select an option...</option>
                            {options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                        </select>
                    )}

                    {/* RATING */}
                    {isQuestionSlide(q.question_type) && q.question_type === 'rating' && (
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

                    {/* SLIDER */}
                    {isQuestionSlide(q.question_type) && q.question_type === 'slider' && (
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

                    {/* DATE */}
                    {isQuestionSlide(q.question_type) && q.question_type === 'date' && (
                        <input 
                            type="date"
                            className="w-full p-4 text-xl border rounded-md bg-white focus:outline-none focus:border-blue-600"
                            value={val || ''}
                            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        />
                    )}

                    {/* CONTACT INFO */}
                    {isQuestionSlide(q.question_type) && q.question_type === 'contact_info' && (
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

                    {/* ADDRESS */}
                    {isQuestionSlide(q.question_type) && q.question_type === 'address' && (
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

                {/* Navigation Buttons */}
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