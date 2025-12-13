import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import forge from 'node-forge'

const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function Form() {
  const router = useRouter()
  const { id } = router.query
  const [qs, setQs] = useState([])
  const [ans, setAns] = useState({})
  const [keys, setKeys] = useState({ q: null, p: null })
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!id) return
    // 1. Parse Hash for Keys
    const h = new URLSearchParams(window.location.hash.substring(1))
    const qKey = h.get('q'); const pKey = h.get('p')
    if (!qKey || !pKey) return alert("Invalid Secure Link")
    setKeys({ q: qKey, p: pKey })

    // 2. Fetch & Decrypt Questions
    supabase.from('questions').select('*').eq('form_id', id).order('order')
      .then(({ data }) => {
        const dec = data.map(row => {
          // AES-GCM Decrypt Helper
          const decrypt = (b64) => {
            if(!b64) return ""
            try {
              const raw = forge.util.decode64(b64)
              const iv = raw.substring(0, 12); const tag = raw.substring(12, 28); const ct = raw.substring(28)
              const d = forge.cipher.createDecipher('AES-GCM', forge.util.decode64(qKey))
              d.start({ iv: iv, tag: tag }); d.update(forge.util.createBuffer(ct)); d.finish()
              return JSON.parse(d.output.toString())
            } catch(e) { return "Encrypted" }
          }
          return { ...row, 
            question_text: decrypt(row.question_text),
            options: decrypt(row.options) || []
          }
        })
        setQs(dec)
      })
  }, [id])

  const submit = async () => {
    // 3. Hybrid Encrypt Answers
    const payload = JSON.stringify(ans)
    
    // A. Generate Session Key
    const sessionKey = forge.random.getBytesSync(32)
    const iv = forge.random.getBytesSync(12)
    
    // B. Encrypt Data (AES-GCM)
    const c = forge.cipher.createCipher('AES-GCM', sessionKey)
    c.start({ iv: iv }); c.update(forge.util.createBuffer(payload)); c.finish()
    const encryptedData = c.output.getBytes()
    const tag = c.mode.tag.getBytes()

    // C. Encrypt Session Key (RSA-OAEP)
    const pubKey = forge.pki.publicKeyFromPem(
      `-----BEGIN PUBLIC KEY-----\n${keys.p}\n-----END PUBLIC KEY-----`
    )
    const encryptedSessionKey = pubKey.encrypt(sessionKey, 'RSA-OAEP', {
      md: forge.md.sha256.create()
    })

    // D. Bundle
    const packageBlob = {
      key: forge.util.encode64(encryptedSessionKey),
      iv: forge.util.encode64(iv),
      tag: forge.util.encode64(tag),
      data: forge.util.encode64(encryptedData)
    }

    await supabase.from('responses').insert({ form_id: id, response: packageBlob })
    alert("Securely Submitted!")
  }

  if(!qs.length) return <div className="p-10 text-center">Loading Secure Form...</div>
  const q = qs[idx]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-20 font-sans">
      <div className="max-w-xl w-full px-6">
        <div className="mb-4 text-center">
          <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded uppercase">🔒 End-to-End Encrypted</span>
        </div>
        
        <h1 className="text-3xl font-bold mb-6 text-gray-900">{q.question_text}</h1>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
          {['text','email'].includes(q.question_type) && (
            <input className="w-full text-xl border-b-2 border-gray-200 focus:border-blue-600 outline-none py-2" 
              value={ans[q.id]||''} onChange={e=>setAns({...ans, [q.id]:e.target.value})} placeholder="Answer..." />
          )}
          {q.question_type === 'single_choice' && (
             <div className="space-y-2">
               {q.options.map(o => (
                 <button key={o} onClick={()=>setAns({...ans, [q.id]:o})} 
                   className={`w-full text-left p-3 rounded border ${ans[q.id]===o?'bg-blue-50 border-blue-500':'hover:bg-gray-50'}`}>
                   {o}
                 </button>
               ))}
             </div>
          )}
        </div>

        <div className="flex justify-between">
          <button onClick={()=>setIdx(i=>Math.max(0,i-1))} disabled={idx===0} className="text-gray-400">Back</button>
          <button onClick={()=>{ if(idx<qs.length-1) setIdx(i=>i+1); else submit() }} 
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700">
            {idx<qs.length-1 ? 'Next' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}