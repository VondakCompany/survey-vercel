import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import forge from 'node-forge'

const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function FormPage() {
  const router = useRouter(); const { id } = router.query
  const [qs, setQs] = useState([]); const [idx, setIdx] = useState(0); const [ans, setAnswers] = useState({})
  const [keys, setKeys] = useState({ q: null, p: null }); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)

  useEffect(() => {
    if (!id) return
    const hash = new URLSearchParams(window.location.hash.substring(1))
    const qKeyB64 = hash.get('q'); const pKeyB64 = hash.get('p')
    if (!qKeyB64 || !pKeyB64) { setError('MISSING KEYS: Use the secure link.'); setLoading(false); return }

    try {
      const qKey = forge.util.decode64(qKeyB64); const pKey = forge.util.decode64(pKeyB64)
      setKeys({ q: qKey, p: pKey })
      supabase.from('questions').select('*').eq('form_id', id).order('order').then(({ data, error }) => {
        if (error) throw error
        setQs(data.map(r => ({
          ...r,
          question_text: decrypt(r.question_text, qKey),
          description: decrypt(r.description, qKey),
          options: decrypt(r.options, qKey) || []
        })))
        setLoading(false)
      })
    } catch (e) { setError("Link Corrupted"); setLoading(false) }
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

  const submit = async () => {
    try {
      const session = forge.random.getBytesSync(32); const iv = forge.random.getBytesSync(12)
      const c = forge.cipher.createCipher('AES-GCM', session); c.start({ iv }); c.update(forge.util.createBuffer(JSON.stringify(ans))); c.finish()
      
      const pem = `-----BEGIN PUBLIC KEY-----\n${forge.util.encode64(keys.p).match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`
      const encKey = forge.pki.publicKeyFromPem(pem).encrypt(session, 'RSA-OAEP', { md: forge.md.sha256.create() })
      
      await supabase.from('responses').insert({ form_id: id, response: {
        key: forge.util.encode64(encKey), iv: forge.util.encode64(iv), tag: forge.util.encode64(c.mode.tag.getBytes()), data: forge.util.encode64(c.output.getBytes())
      }})
      alert('Encrypted response submitted!'); setAnswers({}); setIdx(0)
    } catch (e) { alert(e.message) }
  }

  const handleNext = () => {
    if (qs[idx].required && !['title','info','consent'].includes(qs[idx].question_type) && (!ans[qs[idx].id] || ans[qs[idx].id].length===0)) return alert("Required")
    if (idx < qs.length - 1) { setIdx(idx + 1); setConsentChecked(false) } else submit()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Decrypting...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold">{error}</div>
  if (!qs.length) return <div className="min-h-screen flex items-center justify-center">No questions.</div>

  const q = qs[idx]; const val = ans[q.id]

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col items-center">
      <div className="w-full h-1.5 bg-slate-200 fixed top-0 z-50">
        <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${((idx + 1) / qs.length) * 100}%` }} />
      </div>

      <div className="w-full flex-grow flex flex-col justify-center items-center py-20 px-4">
        {/* MATCHING 800px CARD WITH SHADOW AND ROUNDED CORNERS */}
        <div className="w-full max-w-[800px] bg-white rounded-2xl shadow-xl border border-slate-200 p-10 md:p-14">
          
          <div className="mb-8 flex justify-center">
            <span className="bg-green-50 text-green-700 text-xs font-bold px-3 py-1 rounded-full border border-green-200 uppercase tracking-wide">🔒 End-to-End Encrypted</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-center text-slate-900">{q.question_text}{q.required && <span className="text-red-500 ml-1">*</span>}</h1>
          {q.description && <p className="text-lg text-slate-500 mb-10 text-center">{q.description}</p>}

          <div className="w-full space-y-4">
            {['text','email','phone','number'].includes(q.question_type) && <input type={q.question_type==='number'?'tel':'text'} className="w-full p-4 text-xl border-2 border-slate-200 rounded-xl focus:border-blue-600 outline-none transition-colors" placeholder="Type here..." autoFocus value={val||''} onChange={e=>setAnswers({...ans,[q.id]:e.target.value})} onKeyDown={e=>e.key==='Enter'&&handleNext()} />}
            {q.question_type==='long_text' && <textarea className="w-full p-4 text-xl border-2 border-slate-200 rounded-xl focus:border-blue-600 outline-none h-40 resize-none" placeholder="Type here..." autoFocus value={val||''} onChange={e=>setAnswers({...ans,[q.id]:e.target.value})} />}
            {['single_choice','yes_no'].includes(q.question_type) && (q.question_type==='yes_no'?['Yes','No']:q.options).map((o,i)=><button key={i} onClick={()=>setAnswers({...ans,[q.id]:o})} className={`w-full text-left p-5 rounded-xl border-2 text-lg font-medium transition-all ${val===o?'border-blue-600 bg-blue-50 text-blue-700 shadow-sm':'border-slate-200 bg-white hover:border-blue-300'}`}>{o}</button>)}
            {q.question_type==='checkbox' && q.options.map((o,i)=>{ const curr=val?JSON.parse(val):[]; const chk=curr.includes(o); return <label key={i} className={`flex items-center w-full p-5 rounded-xl border-2 cursor-pointer transition-all ${chk?'border-blue-600 bg-blue-50':'border-slate-200 hover:bg-slate-50'}`}><input type="checkbox" className="hidden" checked={chk} onChange={e=>{ let n=[...curr]; e.target.checked?n.push(o):n=n.filter(x=>x!==o); setAnswers({...ans,[q.id]:JSON.stringify(n)}) }} /><div className={`w-6 h-6 mr-4 border-2 rounded flex items-center justify-center ${chk?'bg-blue-600 border-blue-600':'border-slate-300 bg-white'}`}>{chk&&<span className="text-white font-bold text-sm">✓</span>}</div><span className={`text-lg font-medium ${chk?'text-blue-700':'text-slate-700'}`}>{o}</span></label> })}
            {q.question_type==='consent' && <label className={`flex items-start p-6 border-2 rounded-xl cursor-pointer transition-all ${consentChecked?'border-green-500 bg-green-50':'border-slate-300 hover:border-slate-400'}`}><input type="checkbox" className="hidden" checked={consentChecked} onChange={e=>{ setConsentChecked(e.target.checked); setAnswers({...ans,[q.id]:e.target.checked?"Agreed":""}) }} /><div className={`mt-1 w-6 h-6 mr-4 border-2 rounded flex items-center justify-center ${consentChecked?'bg-green-600 border-green-600':'border-slate-300 bg-white'}`}>{consentChecked&&<span className="text-white font-bold text-sm">✓</span>}</div><div className="flex-1"><span className="text-lg font-bold block mb-1">I Agree</span><span className="text-slate-500">I accept the terms.</span></div></label>}
          </div>

          <div className="flex justify-between items-center mt-12 pt-8 border-t border-slate-100">
             <button onClick={()=>idx>0&&setIdx(idx-1)} className={`text-slate-400 hover:text-slate-600 font-bold px-4 py-2 ${idx===0?'invisible':''}`}>Back</button>
             <button onClick={handleNext} disabled={q.question_type==='consent'&&!consentChecked} className={`text-white text-lg font-bold py-3 px-8 rounded-xl shadow-lg transition-all transform active:scale-95 ${q.question_type==='consent'&&!consentChecked?'bg-slate-300 cursor-not-allowed':'bg-blue-600 hover:bg-blue-700 hover:shadow-xl'}`}>{idx<qs.length-1?(q.button_text||'Next'):'Submit'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}