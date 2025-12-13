import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-100">
      
      {/* Navigation */}
      <nav className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
        <div className="text-2xl font-extrabold tracking-tight text-blue-700">SlideForm</div>
        <div className="flex items-center space-x-6">
          <Link href="/login" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition">Sign in</Link>
          <Link href="/register" className="bg-slate-900 text-white text-sm font-bold py-2.5 px-5 rounded-full hover:bg-slate-800 transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="mt-20 sm:mt-32 px-6 text-center max-w-5xl mx-auto pb-20">
        <div className="inline-block px-4 py-1.5 mb-6 rounded-full bg-blue-50 text-blue-700 text-sm font-bold tracking-wide uppercase border border-blue-100">
          Beta Release v1.0
        </div>
        
        <h1 className="text-5xl sm:text-7xl font-black tracking-tight text-slate-900 mb-8 leading-tight">
          Surveys, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Encrypted.</span>
        </h1>
        
        <p className="text-xl sm:text-2xl text-slate-500 mb-12 max-w-2xl mx-auto leading-relaxed">
          The professional slide-based form builder that secures your data on your device before it ever touches the cloud.
        </p>
        
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link href="/register" className="bg-blue-600 text-white text-lg font-bold py-4 px-10 rounded-xl hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all transform hover:-translate-y-1">
            Create Free Account
          </Link>
          <a href="#" className="bg-white text-slate-700 text-lg font-bold py-4 px-10 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all">
            Download App
          </a>
        </div>

        {/* Feature Pill */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-8 text-left">
          {[
            { icon: "🔒", title: "End-to-End Encryption", desc: "Data is encrypted locally using AES-256." },
            { icon: "⚡", title: "Instant Sync", desc: "Push updates from desktop to web in seconds." },
            { icon: "💎", title: "Premium UX", desc: "Slide-based interface that respondents love." }
          ].map((f, i) => (
            <div key={i} className="p-6 rounded-2xl bg-slate-50 border border-slate-100 hover:border-blue-100 transition-colors">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">{f.title}</h3>
              <p className="text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
      
      {/* Simple Footer */}
      <footer className="border-t border-slate-100 py-10 text-center text-slate-400 text-sm">
        &copy; {new Date().getFullYear()} SlideForm Inc. All rights reserved.
      </footer>
    </div>
  )
}