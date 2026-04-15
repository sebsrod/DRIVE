import ManualContent from '../components/ManualContent'

export default function Manual() {
  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-2xl font-bold text-slate-900">Manual de uso</h2>
      <p className="mb-6 text-sm text-slate-500">
        Guía rápida de las funcionalidades de Office Drive.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <ManualContent />
      </div>
    </div>
  )
}
