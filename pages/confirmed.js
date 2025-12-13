import Link from 'next/link'

export default function Confirmed() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-10 rounded-xl shadow-xl text-center max-w-md w-full border border-gray-100">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Email Confirmed!</h1>
        <p className="text-gray-600 mb-8 text-lg">
          Your account has been successfully verified. You can now close this tab or return to the app.
        </p>
        <Link href="/" className="block w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-all">
          Go to Home
        </Link>
      </div>
    </div>
  )
}