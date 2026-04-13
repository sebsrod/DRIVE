import { useRef, useState } from 'react'

interface Props {
  onUpload: (file: File) => Promise<void>
  label?: string
}

export default function UploadButton({ onUpload, label = 'Subir documento' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      await onUpload(file)
    } catch (err) {
      alert('Error al subir: ' + (err as Error).message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={handleChange} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {uploading ? 'Subiendo…' : label}
      </button>
    </>
  )
}
