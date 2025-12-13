import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* Navbar */}
      <nav className="flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-blue-700">SlideForm</div>
        <div className="space-x-4">
          <Link href="/login" className="text-gray-600 hover:text-gray-900 font-medium">Log in</Link>
          <Link href="/register" className="bg-blue-600 text-white px-5 py-2 rounded-full font-medium hover:bg-blue-700 transition">Sign up</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex flex-col items-center justify-center text-center mt-20 px-4">
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-6 max-w-4xl">
          Secure, Encrypted Surveys <br/>
          <span className="text-blue-600">Simplified.</span>
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl">
          Build professional forms with end-to-end encryption. 
          Manage your data securely on your local device with cloud syncing capabilities.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/register" className="bg-blue-600 text-white text-lg font-bold py-4 px-10 rounded-lg hover:bg-blue-700 shadow-lg transition transform active:scale-95">
            Get Started for Free
          </Link>
          <Link href="/login" className="bg-gray-100 text-gray-700 text-lg font-bold py-4 px-10 rounded-lg hover:bg-gray-200 transition">
            Access Dashboard
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 max-w-6xl w-full px-4 mb-20">
          <div className="p-8 border border-gray-100 rounded-xl shadow-sm bg-gray-50">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-bold mb-2">E2E Encryption</h3>
            <p className="text-gray-600">Your data is encrypted on your device before it ever touches the cloud.</p>
          </div>
          <div className="p-8 border border-gray-100 rounded-xl shadow-sm bg-gray-50">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-xl font-bold mb-2">Modern Builder</h3>
            <p className="text-gray-600">Create beautiful slide-based forms with Title, Consent, and Info slides.</p>
          </div>
          <div className="p-8 border border-gray-100 rounded-xl shadow-sm bg-gray-50">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-bold mb-2">Instant Sync</h3>
            <p className="text-gray-600">Publish your local forms to the web instantly with one click.</p>
          </div>
        </div>
      </main>
    </div>
  )
}