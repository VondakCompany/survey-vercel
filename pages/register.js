import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const SUPABASE_URL = 'https://xrgrlfpjeovjeshebxya.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TgJkb2-QML1h1aOAYAVupg_njoyLImS'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState({ type: '', msg: '' })

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true); setStatus({})

    if (password.length < 6) {
      setStatus({ type: 'error', msg: 'Password must be at least 6 characters.' })
      setLoading(false); return
    }

    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      setStatus({ type: 'success', msg: 'Success! Check your email to verify your account.' })
    } catch (error) {
      setStatus({ type: 'error', msg: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 font-sans text-slate-900">
      
      {/* Brand Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-blue-700">SlideForm</h1>
        <p className="mt-2 text-sm text-slate-500 font-medium tracking-wide uppercase">Secure Survey Platform</p>
      </div>

      {/* Main Card */}
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-8 sm:p-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Create your account</h2>
            <p className="mt-2 text-sm text-slate-600">
              Start building encrypted surveys today.
            </p>
          </div>

          {status.msg && (
            <div className={`mb-6 p-4 rounded-lg text-sm font-medium flex items-center ${
              status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'
            }`}>
              {status.type === 'error' ? '⚠️ ' : '✅ '}
              <span className="ml-2">{status.msg}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleRegister}>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1">Email address</label>
              <input
                id="email"
                type="email"
                required
                className="appearance-none block w-full px-4 py-3 border border-slate-300 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
              <input
                id="password"
                type="password"
                required
                className="appearance-none block w-full px-4 py-3 border border-slate-300 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all transform active:scale-[0.98] ${loading ? 'opacity-70 cursor-wait' : ''}`}
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}